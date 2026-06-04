-- CreateTable
CREATE TABLE "GuitarPracticeItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "defaultSeedKey" TEXT,
    "defaultPlannedSeconds" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "archivedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "GuitarPracticeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuitarPracticeDay" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "practiceDate" DATE NOT NULL,
    "comment" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "GuitarPracticeDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuitarPracticeItemLog" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "practiceDayId" UUID NOT NULL,
    "practiceItemId" UUID NOT NULL,
    "itemLabelSnapshot" TEXT NOT NULL,
    "plannedSeconds" INTEGER NOT NULL,
    "elapsedSeconds" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "GuitarPracticeItemLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuitarPracticeReview" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "dayStart" DATE NOT NULL,
    "text" TEXT NOT NULL,
    "generatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "GuitarPracticeReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GuitarPracticeItem_userId_sortOrder_idx" ON "GuitarPracticeItem"("userId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "GuitarPracticeItem_userId_defaultSeedKey_key" ON "GuitarPracticeItem"("userId", "defaultSeedKey");

-- CreateIndex
CREATE INDEX "GuitarPracticeDay_userId_practiceDate_idx" ON "GuitarPracticeDay"("userId", "practiceDate");

-- CreateIndex
CREATE UNIQUE INDEX "GuitarPracticeDay_userId_practiceDate_key" ON "GuitarPracticeDay"("userId", "practiceDate");

-- CreateIndex
CREATE INDEX "GuitarPracticeItemLog_practiceDayId_idx" ON "GuitarPracticeItemLog"("practiceDayId");

-- CreateIndex
CREATE INDEX "GuitarPracticeItemLog_practiceItemId_idx" ON "GuitarPracticeItemLog"("practiceItemId");

-- CreateIndex
CREATE UNIQUE INDEX "GuitarPracticeItemLog_practiceDayId_practiceItemId_key" ON "GuitarPracticeItemLog"("practiceDayId", "practiceItemId");

-- CreateIndex
CREATE INDEX "GuitarPracticeReview_userId_dayStart_idx" ON "GuitarPracticeReview"("userId", "dayStart");

-- CreateIndex
CREATE UNIQUE INDEX "GuitarPracticeReview_userId_dayStart_key" ON "GuitarPracticeReview"("userId", "dayStart");

-- AddForeignKey
ALTER TABLE "GuitarPracticeItem" ADD CONSTRAINT "GuitarPracticeItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuitarPracticeDay" ADD CONSTRAINT "GuitarPracticeDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuitarPracticeItemLog" ADD CONSTRAINT "GuitarPracticeItemLog_practiceDayId_fkey" FOREIGN KEY ("practiceDayId") REFERENCES "GuitarPracticeDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuitarPracticeItemLog" ADD CONSTRAINT "GuitarPracticeItemLog_practiceItemId_fkey" FOREIGN KEY ("practiceItemId") REFERENCES "GuitarPracticeItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuitarPracticeReview" ADD CONSTRAINT "GuitarPracticeReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddConstraint
ALTER TABLE "GuitarPracticeItem" ADD CONSTRAINT "GuitarPracticeItem_defaultPlannedSeconds_check" CHECK ("defaultPlannedSeconds" > 0 AND "defaultPlannedSeconds" <= 14400);

-- AddConstraint
ALTER TABLE "GuitarPracticeItemLog" ADD CONSTRAINT "GuitarPracticeItemLog_plannedSeconds_check" CHECK ("plannedSeconds" > 0 AND "plannedSeconds" <= 14400);

-- AddConstraint
ALTER TABLE "GuitarPracticeItemLog" ADD CONSTRAINT "GuitarPracticeItemLog_elapsedSeconds_check" CHECK ("elapsedSeconds" >= 0 AND "elapsedSeconds" <= 28800);
