export type AppEnv = {
  Variables: {
    customerId: string;
    parsedBody: any;
    idempotencyKey: string;
    idempotencyRoute: string;
    idempotencyBodyHash: string;
  };
};
