-- AlterTable
ALTER TABLE "ai_assistant_messages" ADD COLUMN     "aiRequestId" TEXT,
ADD COLUMN     "completionTokens" INTEGER,
ADD COLUMN     "estimatedCostUsd" DOUBLE PRECISION,
ADD COLUMN     "promptTokens" INTEGER,
ADD COLUMN     "totalTokens" INTEGER;
