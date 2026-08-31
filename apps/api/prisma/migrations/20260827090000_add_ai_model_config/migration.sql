-- CreateEnum
CREATE TYPE "AiProviderType" AS ENUM ('openai', 'groq', 'anthropic', 'google');

-- CreateEnum
CREATE TYPE "AiModelPurpose" AS ENUM ('chat', 'reasoning', 'websearch', 'embedding');

-- CreateTable
CREATE TABLE "ai_model_catalog_entries" (
    "id" TEXT NOT NULL,
    "provider" "AiProviderType" NOT NULL,
    "modelId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fallbackProvider" "AiProviderType",
    "fallbackModelId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_model_catalog_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_model_assignments" (
    "purpose" "AiModelPurpose" NOT NULL,
    "modelEntryId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_model_assignments_pkey" PRIMARY KEY ("purpose")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_model_catalog_entries_provider_modelId_key" ON "ai_model_catalog_entries"("provider", "modelId");

-- AddForeignKey
ALTER TABLE "ai_model_assignments" ADD CONSTRAINT "ai_model_assignments_modelEntryId_fkey" FOREIGN KEY ("modelEntryId") REFERENCES "ai_model_catalog_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
