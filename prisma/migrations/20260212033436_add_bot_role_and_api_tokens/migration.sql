-- AlterEnum
ALTER TYPE "EmployeeRole" ADD VALUE 'BOT';

-- AlterTable
ALTER TABLE "Employee" ALTER COLUMN "password" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ApiToken" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Default',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiToken_token_key" ON "ApiToken"("token");

-- CreateIndex
CREATE INDEX "ApiToken_employeeId_idx" ON "ApiToken"("employeeId");

-- AddForeignKey
ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
