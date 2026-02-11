# Stage 1: Dependencies
FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: Build
FROM node:22-alpine AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Dummy DATABASE_URL for prisma generate (only needs schema, not a real connection)
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npx prisma generate
RUN npm run build

# Stage 3: Production
FROM node:22-alpine AS production
WORKDIR /app

ENV NODE_ENV=production

# Install production dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy Prisma schema, migrations, and config for migrate deploy
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma

# Copy Prisma CLI and dotenv from build stage (needed for migrations)
COPY --from=build /app/node_modules/prisma ./node_modules/prisma
COPY --from=build /app/node_modules/dotenv ./node_modules/dotenv

# Copy built application
COPY --from=build /app/dist ./dist

ENV PORT=3000
EXPOSE 3000

# Run migrations and start server
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
