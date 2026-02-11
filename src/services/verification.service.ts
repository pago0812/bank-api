import prisma from '../lib/prisma.js';
import { signAccessToken } from '../lib/auth.js';
import { AppError } from '../lib/errors.js';

interface Question {
  id: string;
  text: string;
  weight: number;
}

const ALL_QUESTIONS: Question[] = [
  { id: 'last_txn_amount', text: "What was the amount of the customer's last transaction?", weight: 0.30 },
  { id: 'account_number', text: "What is one of the customer's account numbers?", weight: 0.25 },
  { id: 'card_last_four', text: "What are the last 4 digits of the customer's card?", weight: 0.25 },
  { id: 'date_of_birth', text: "What is the customer's date of birth?", weight: 0.15 },
  { id: 'phone_number', text: "What is the customer's registered phone number?", weight: 0.15 },
  { id: 'email', text: "What is the customer's registered email address?", weight: 0.15 },
  { id: 'address', text: "What is the customer's address or ZIP code?", weight: 0.15 },
  { id: 'full_name', text: "What is the customer's full name?", weight: 0.10 },
];

function shuffleWithinWeightTiers(questions: Question[]): Question[] {
  const tiers = new Map<number, Question[]>();
  for (const q of questions) {
    const tier = tiers.get(q.weight) || [];
    tier.push(q);
    tiers.set(q.weight, tier);
  }

  const result: Question[] = [];
  const sortedWeights = [...tiers.keys()].sort((a, b) => b - a);
  for (const weight of sortedWeights) {
    const tier = tiers.get(weight)!;
    // Fisher-Yates shuffle within tier
    for (let i = tier.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tier[i], tier[j]] = [tier[j], tier[i]];
    }
    result.push(...tier);
  }
  return result;
}

export async function startVerification(phoneNumber: string) {
  const customer = await prisma.customer.findUnique({
    where: { phone: phoneNumber },
    include: {
      accounts: { include: { cards: true } },
    },
  });

  if (!customer) {
    throw new AppError(404, 'NOT_FOUND', 'No customer found with this phone number');
  }

  const hasCards = customer.accounts.some((a) => a.cards.length > 0);

  let available = ALL_QUESTIONS.filter((q) => {
    if (q.id === 'phone_number') return false; // phone was used to start session
    if (q.id === 'card_last_four' && !hasCards) return false;
    return true;
  });

  available = shuffleWithinWeightTiers(available);

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  const session = await prisma.verificationSession.create({
    data: {
      phoneNumber,
      customerId: customer.id,
      expiresAt,
      questionsAsked: [available[0].id],
    },
  });

  return {
    sessionId: session.id,
    status: 'IN_PROGRESS',
    question: {
      id: available[0].id,
      text: available[0].text,
    },
    expiresAt: session.expiresAt.toISOString(),
  };
}

export async function answerQuestion(sessionId: string, questionId: string, answer: string) {
  const session = await prisma.verificationSession.findUnique({
    where: { id: sessionId },
    include: {
      customer: {
        include: {
          accounts: {
            include: {
              cards: true,
              transactions: {
                where: { status: 'COMPLETED' },
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
            },
          },
        },
      },
    },
  });

  if (!session || session.status !== 'IN_PROGRESS') {
    throw new AppError(404, 'NOT_FOUND', 'Verification session not found');
  }

  if (session.expiresAt < new Date()) {
    await prisma.verificationSession.update({
      where: { id: sessionId },
      data: { status: 'EXPIRED' },
    });
    throw new AppError(422, 'SESSION_EXPIRED', 'Verification session has expired');
  }

  const customer = session.customer!;
  const questionsAsked = session.questionsAsked as string[];

  // Check that questionId matches the latest question asked
  if (questionsAsked[questionsAsked.length - 1] !== questionId) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Invalid question ID for current session state');
  }

  const questionDef = ALL_QUESTIONS.find((q) => q.id === questionId)!;
  const correct = checkAnswer(questionId, answer, customer);

  let newConfidence = session.confidence;
  let newCorrectAnswers = session.correctAnswers;

  if (correct) {
    newConfidence += questionDef.weight;
    newCorrectAnswers++;
  } else {
    newConfidence -= questionDef.weight / 2;
  }
  if (newConfidence < 0) newConfidence = 0;

  // Check if verified
  if (newConfidence >= 0.75) {
    await prisma.verificationSession.update({
      where: { id: sessionId },
      data: {
        status: 'VERIFIED',
        confidence: newConfidence,
        correctAnswers: newCorrectAnswers,
      },
    });

    const accessToken = await signAccessToken(customer.id);
    return {
      sessionId,
      status: 'VERIFIED',
      correct,
      confidence: newConfidence,
      accessToken,
      expiresIn: 900,
      customer: {
        id: customer.id,
        firstName: customer.firstName,
        lastName: customer.lastName,
      },
    };
  }

  // Find next question
  const hasCards = customer.accounts.some((a) => a.cards.length > 0);
  const available = ALL_QUESTIONS.filter((q) => {
    if (q.id === 'phone_number') return false;
    if (q.id === 'card_last_four' && !hasCards) return false;
    if (questionsAsked.includes(q.id)) return false;
    return true;
  });

  if (available.length === 0) {
    // All questions exhausted
    await prisma.verificationSession.update({
      where: { id: sessionId },
      data: {
        status: 'FAILED',
        confidence: newConfidence,
        correctAnswers: newCorrectAnswers,
      },
    });

    return {
      sessionId,
      status: 'FAILED',
      correct,
      confidence: newConfidence,
      message: 'Identity verification failed. Insufficient confidence score.',
    };
  }

  // Sort remaining by weight descending with shuffle within tiers
  const sorted = shuffleWithinWeightTiers(available);
  const nextQuestion = sorted[0];

  await prisma.verificationSession.update({
    where: { id: sessionId },
    data: {
      confidence: newConfidence,
      correctAnswers: newCorrectAnswers,
      questionsAsked: [...questionsAsked, nextQuestion.id],
    },
  });

  return {
    sessionId,
    status: 'IN_PROGRESS',
    correct,
    confidence: newConfidence,
    nextQuestion: {
      id: nextQuestion.id,
      text: nextQuestion.text,
    },
  };
}

function checkAnswer(questionId: string, answer: string, customer: any): boolean {
  switch (questionId) {
    case 'full_name':
      return answer.toLowerCase() === `${customer.firstName} ${customer.lastName}`.toLowerCase();

    case 'date_of_birth': {
      const dob = customer.dateOfBirth as Date;
      const target = `${dob.getUTCFullYear()}-${String(dob.getUTCMonth() + 1).padStart(2, '0')}-${String(dob.getUTCDate()).padStart(2, '0')}`;
      // Accept YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY
      const cleaned = answer.trim();
      if (cleaned === target) return true;
      // Try MM/DD/YYYY
      const slashParts = cleaned.split('/');
      if (slashParts.length === 3) {
        const [a, b, c] = slashParts;
        // MM/DD/YYYY
        const attempt1 = `${c}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`;
        if (attempt1 === target) return true;
        // DD/MM/YYYY
        const attempt2 = `${c}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`;
        if (attempt2 === target) return true;
      }
      return false;
    }

    case 'phone_number': {
      const digits = answer.replace(/\D/g, '');
      const customerDigits = (customer.phone as string).replace(/\D/g, '');
      return digits.slice(-10) === customerDigits.slice(-10);
    }

    case 'email':
      return answer.toLowerCase().trim() === customer.email.toLowerCase();

    case 'address': {
      const trimmed = answer.trim().toLowerCase();
      if (trimmed === customer.zipCode.toLowerCase()) return true;
      if (customer.address.toLowerCase().includes(trimmed)) return true;
      if (trimmed.includes(customer.zipCode.toLowerCase())) return true;
      return false;
    }

    case 'account_number':
      return customer.accounts.some((a: any) => a.accountNumber === answer.trim());

    case 'card_last_four': {
      const last4 = answer.trim();
      return customer.accounts.some((a: any) =>
        a.cards.some((card: any) => card.maskedNumber.endsWith(last4)),
      );
    }

    case 'last_txn_amount': {
      // Find most recent completed transaction across all accounts
      let latestTxn: any = null;
      for (const account of customer.accounts) {
        for (const txn of account.transactions) {
          if (!latestTxn || txn.createdAt > latestTxn.createdAt) {
            latestTxn = txn;
          }
        }
      }
      if (!latestTxn) return false;

      const cleaned = answer.trim().replace(/[$,]/g, '');
      const asNumber = parseFloat(cleaned);
      if (isNaN(asNumber)) return false;

      // If it looks like dollars (has decimal point in original), convert to cents
      if (cleaned.includes('.')) {
        return Math.round(asNumber * 100) === latestTxn.amount;
      }
      // Otherwise treat as cents
      return asNumber === latestTxn.amount;
    }

    default:
      return false;
  }
}
