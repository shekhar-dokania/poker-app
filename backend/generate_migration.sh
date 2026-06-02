#!/bin/bash
set -e

echo "Saving new schema..."
cp prisma/schema.prisma prisma/schema.prisma.new

echo "Reverting to old schema..."
cat << 'OLD' > prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
model User {
  id           String          @id @default(uuid())
  username     String          @unique
  passwordHash String
  totalProfit  Int             @default(0)
  sessions     GameSession[]
  ledger       LedgerEntry[]
  ownedClubs   Club[]          @relation("ClubOwner")
  memberships  ClubMember[]
}
model GameSession {
  id           String          @id @default(uuid())
  roomCode     String
  hostId       String
  host         User            @relation(fields: [hostId], references: [id])
  clubId       String?
  club         Club?           @relation(fields: [clubId], references: [id])
  status       String          @default("active") // "active", "ended"
  settings     Json
  createdAt    DateTime        @default(now())
  endedAt      DateTime?
  ledger       LedgerEntry[]
  hands        HandHistory[]
}
model LedgerEntry {
  id           String          @id @default(uuid())
  sessionId    String
  session      GameSession     @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  userId       String
  user         User            @relation(fields: [userId], references: [id])
  totalBuyIn   Int
  finalChips   Int
  netProfit    Int
}
model HandHistory {
  id           String          @id @default(uuid())
  sessionId    String
  session      GameSession     @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  handData     Json
  createdAt    DateTime        @default(now())
}
model Club {
  id          String        @id @default(uuid())
  name        String
  code        String        @unique // 6-character join code
  ownerId     String
  owner       User          @relation("ClubOwner", fields: [ownerId], references: [id])
  members     ClubMember[]
  games       GameSession[]
  createdAt   DateTime      @default(now())
}
model ClubMember {
  id          String   @id @default(uuid())
  clubId      String
  club        Club     @relation(fields: [clubId], references: [id], onDelete: Cascade)
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  status      String   @default("PENDING") // "PENDING", "APPROVED", "REJECTED"
  role        String   @default("MEMBER") // "MEMBER", "ADMIN", "OWNER"
  joinedAt    DateTime @default(now())
  @@unique([clubId, userId]) // Prevent duplicate requests
}
OLD

echo "Pushing old schema to database..."
npx prisma db push --force-reset

echo "Restoring new schema..."
mv prisma/schema.prisma.new prisma/schema.prisma

echo "Generating migration script..."
mkdir -p prisma/migrations/20260602000000_auth_updates
echo 'DELETE FROM "User";' > prisma/migrations/20260602000000_auth_updates/migration.sql
npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script >> prisma/migrations/20260602000000_auth_updates/migration.sql

echo "Pushing new schema to local database..."
npx prisma db push --force-reset

echo "Done."
