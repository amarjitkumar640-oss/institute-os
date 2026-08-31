-- AlterTable
ALTER TABLE "gov_current_affairs" ADD COLUMN     "eventDate" TIMESTAMP(3),
ADD COLUMN     "importance" TEXT,
ADD COLUMN     "level" TEXT,
ADD COLUMN     "ministry" TEXT,
ADD COLUMN     "newsStatus" TEXT,
ADD COLUMN     "organization" TEXT,
ADD COLUMN     "richData" JSONB,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "verificationStatus" TEXT;

-- CreateTable
CREATE TABLE "gov_job_vacancy_prompt_templates" (
    "category" "GovOrgType" NOT NULL,
    "prompt" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "lastRunStatus" TEXT,
    "lastRunError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gov_job_vacancy_prompt_templates_pkey" PRIMARY KEY ("category")
);

-- CreateTable
CREATE TABLE "gov_current_affairs_prompt_template" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "prompt" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "lastRunStatus" TEXT,
    "lastRunError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gov_current_affairs_prompt_template_pkey" PRIMARY KEY ("id")
);
