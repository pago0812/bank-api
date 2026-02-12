-- DropTable
DROP TABLE "Payment";

-- DropEnum
DROP TYPE "PaymentStatus";

-- Update existing MANAGER employees to ADMIN before removing the enum value
UPDATE "Employee" SET "role" = 'ADMIN' WHERE "role" = 'MANAGER';

-- AlterEnum: remove MANAGER from EmployeeRole
CREATE TYPE "EmployeeRole_new" AS ENUM ('TELLER', 'ADMIN', 'CALL_CENTER_AGENT', 'BOT');
ALTER TABLE "Employee" ALTER COLUMN "role" TYPE "EmployeeRole_new" USING ("role"::text::"EmployeeRole_new");
ALTER TYPE "EmployeeRole" RENAME TO "EmployeeRole_old";
ALTER TYPE "EmployeeRole_new" RENAME TO "EmployeeRole";
DROP TYPE "EmployeeRole_old";
