-- CreateEnum
CREATE TYPE "GovScheduleFrequency" AS ENUM ('hourly', 'daily', 'weekly', 'monthly');

-- AlterTable
ALTER TABLE "gov_current_affairs_prompt_template" ADD COLUMN     "scheduleDayOfMonth" INTEGER,
ADD COLUMN     "scheduleDayOfWeek" INTEGER,
ADD COLUMN     "scheduleFrequency" "GovScheduleFrequency" NOT NULL DEFAULT 'daily',
ADD COLUMN     "scheduleTimeOfDay" TEXT DEFAULT '06:00';

-- AlterTable
ALTER TABLE "gov_job_vacancy_prompt_templates" ADD COLUMN     "scheduleDayOfMonth" INTEGER,
ADD COLUMN     "scheduleDayOfWeek" INTEGER,
ADD COLUMN     "scheduleFrequency" "GovScheduleFrequency" NOT NULL DEFAULT 'hourly',
ADD COLUMN     "scheduleTimeOfDay" TEXT;

-- AlterTable
ALTER TABLE "gov_sources" ADD COLUMN     "scheduleDayOfMonth" INTEGER,
ADD COLUMN     "scheduleDayOfWeek" INTEGER,
ADD COLUMN     "scheduleFrequency" "GovScheduleFrequency" NOT NULL DEFAULT 'hourly',
ADD COLUMN     "scheduleTimeOfDay" TEXT;
