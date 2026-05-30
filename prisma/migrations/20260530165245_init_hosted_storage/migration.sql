-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clerkUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoodEntry" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "capturedAt" TIMESTAMPTZ(6) NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "r2Key" TEXT NOT NULL,
    "publicUrl" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "migrationKey" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "FoodEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyRoundup" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "dayStart" DATE NOT NULL,
    "text" TEXT NOT NULL,
    "generatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "DailyRoundup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_clerkUserId_key" ON "User"("clerkUserId");

-- CreateIndex
CREATE INDEX "FoodEntry_userId_capturedAt_idx" ON "FoodEntry"("userId", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FoodEntry_userId_r2Key_key" ON "FoodEntry"("userId", "r2Key");

-- CreateIndex
CREATE UNIQUE INDEX "FoodEntry_userId_migrationKey_key" ON "FoodEntry"("userId", "migrationKey");

-- CreateIndex
CREATE INDEX "DailyRoundup_userId_dayStart_idx" ON "DailyRoundup"("userId", "dayStart");

-- CreateIndex
CREATE UNIQUE INDEX "DailyRoundup_userId_dayStart_key" ON "DailyRoundup"("userId", "dayStart");

-- AddForeignKey
ALTER TABLE "FoodEntry" ADD CONSTRAINT "FoodEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyRoundup" ADD CONSTRAINT "DailyRoundup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
