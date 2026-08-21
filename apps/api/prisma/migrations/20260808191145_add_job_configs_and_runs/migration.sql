-- CreateEnum
CREATE TYPE "JobRunStatus" AS ENUM ('running', 'success', 'failure');

-- CreateTable
CREATE TABLE "job_configs" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "intervalMinutes" INTEGER NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_runs" (
    "id" TEXT NOT NULL,
    "jobKey" TEXT NOT NULL,
    "status" "JobRunStatus" NOT NULL DEFAULT 'running',
    "trigger" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "resultSummary" JSONB,
    "triggeredById" TEXT,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "job_configs_key_key" ON "job_configs"("key");

-- CreateIndex
CREATE INDEX "job_runs_jobKey_startedAt_idx" ON "job_runs"("jobKey", "startedAt");

-- AddForeignKey
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_jobKey_fkey" FOREIGN KEY ("jobKey") REFERENCES "job_configs"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
