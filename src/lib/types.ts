export type AppEnv = {
  Variables: {
    customerId: string;
    employeeId: string;
    employeeRole: string;
    parsedBody: any;
    idempotencyKey: string;
    idempotencyRoute: string;
    idempotencyBodyHash: string;
  };
};
