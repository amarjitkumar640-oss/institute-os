-- CreateEnum
CREATE TYPE "GovSourceFetchMode" AS ENUM ('url', 'search');

-- AlterTable
ALTER TABLE "gov_sources" ADD COLUMN     "fetchMode" "GovSourceFetchMode" NOT NULL DEFAULT 'url',
ADD COLUMN     "searchQuery" TEXT,
ALTER COLUMN "url" DROP NOT NULL;
