-- CreateEnum
CREATE TYPE "AiAssistantMessageRole" AS ENUM ('user', 'assistant');

-- CreateTable
CREATE TABLE "ai_assistant_sessions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "staffId" TEXT,
    "surface" TEXT NOT NULL,
    "title" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "context" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_assistant_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_assistant_messages" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" "AiAssistantMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "replyToId" TEXT,
    "mechanism" TEXT,
    "toolCalls" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_assistant_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_assistant_cache_entries" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_assistant_cache_entries_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "gov_exams_meta" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "lastDataChangeAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gov_exams_meta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_assistant_sessions_tenantId_staffId_surface_lastMessageA_idx" ON "ai_assistant_sessions"("tenantId", "staffId", "surface", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "ai_assistant_messages_replyToId_key" ON "ai_assistant_messages"("replyToId");

-- CreateIndex
CREATE INDEX "ai_assistant_messages_sessionId_createdAt_idx" ON "ai_assistant_messages"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_assistant_cache_entries_expiresAt_idx" ON "ai_assistant_cache_entries"("expiresAt");

-- AddForeignKey
ALTER TABLE "ai_assistant_sessions" ADD CONSTRAINT "ai_assistant_sessions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_assistant_sessions" ADD CONSTRAINT "ai_assistant_sessions_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_assistant_messages" ADD CONSTRAINT "ai_assistant_messages_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ai_assistant_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_assistant_messages" ADD CONSTRAINT "ai_assistant_messages_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "ai_assistant_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
