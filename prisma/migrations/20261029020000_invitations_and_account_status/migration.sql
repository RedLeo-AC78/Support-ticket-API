ALTER TYPE "Role" ADD VALUE 'AGENT';
CREATE TYPE "AccountStatus" AS ENUM ('INVITED', 'ACTIVE', 'DISABLED');
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN "status" "AccountStatus" NOT NULL DEFAULT 'INVITED';
-- Préserver les comptes déjà créés, notamment le premier super administrateur.
UPDATE "User" SET "status" = 'ACTIVE' WHERE "passwordHash" IS NOT NULL;
CREATE TABLE "Invitation" (
 "hash" TEXT PRIMARY KEY,
 "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
 "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "Invitation_userId_idx" ON "Invitation"("userId");
