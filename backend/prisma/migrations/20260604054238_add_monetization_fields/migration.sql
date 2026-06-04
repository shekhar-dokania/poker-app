-- AlterTable
ALTER TABLE "GameSession" ADD COLUMN     "clubId" TEXT,
ADD COLUMN     "expiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "coins" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastFreeClaim" TIMESTAMP(3);