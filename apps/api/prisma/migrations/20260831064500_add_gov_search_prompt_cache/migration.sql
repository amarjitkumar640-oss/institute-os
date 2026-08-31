-- AlterTable
ALTER TABLE "gov_current_affairs_prompt_template" ADD COLUMN     "lastSearchAt" TIMESTAMP(3),
ADD COLUMN     "lastSearchCitations" JSONB,
ADD COLUMN     "lastSearchContent" TEXT;

-- AlterTable
ALTER TABLE "gov_job_vacancy_prompt_templates" ADD COLUMN     "lastSearchAt" TIMESTAMP(3),
ADD COLUMN     "lastSearchCitations" JSONB,
ADD COLUMN     "lastSearchContent" TEXT;
