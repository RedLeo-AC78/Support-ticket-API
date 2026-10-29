CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN', 'SUPER_ADMIN');
CREATE TABLE "User" (
 "id" SERIAL PRIMARY KEY, "email" VARCHAR(254) NOT NULL UNIQUE,
 "passwordHash" TEXT NOT NULL, "role" "Role" NOT NULL DEFAULT 'USER',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "Ticket" ADD COLUMN "ownerId" INTEGER REFERENCES "User"("id");
CREATE INDEX "Ticket_ownerId_idx" ON "Ticket"("ownerId");
CREATE TABLE "Session" (
 "id" TEXT PRIMARY KEY, "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
 "accessHash" TEXT NOT NULL UNIQUE, "accessExpiresAt" TIMESTAMP(3) NOT NULL,
 "expiresAt" TIMESTAMP(3) NOT NULL, "revokedAt" TIMESTAMP(3)
);
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE TABLE "RefreshToken" (
 "hash" TEXT PRIMARY KEY, "sessionId" TEXT NOT NULL REFERENCES "Session"("id") ON DELETE CASCADE,
 "usedAt" TIMESTAMP(3)
);
CREATE INDEX "RefreshToken_sessionId_idx" ON "RefreshToken"("sessionId");
CREATE TABLE "PasswordReset" (
 "hash" TEXT PRIMARY KEY, "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
 "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "PasswordReset_userId_idx" ON "PasswordReset"("userId");
