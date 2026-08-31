import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Send, Bot, User as UserIcon, Zap } from "lucide-react";
import { getAssistantSession, askInSession, type AssistantMessage } from "@/api/govExams";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/use-toast";
import { ResponseBlocks } from "@/components/ai/ResponseBlocks";
import { formatDateTime } from "@/lib/utils";

function extractError(err: unknown): string {
  const msg = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
  return typeof msg === "string" ? msg : "Something went wrong";
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-0.5 py-1.5">
      <span className="h-1.5 w-1.5 rounded-full bg-gray-300 animate-bounce [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 rounded-full bg-gray-300 animate-bounce [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 rounded-full bg-gray-300 animate-bounce" />
    </div>
  );
}

function TokenUsage({ message }: { message: AssistantMessage }) {
  if (message.promptTokens == null && message.completionTokens == null) return null;
  const input = message.promptTokens ?? 0;
  const output = message.completionTokens ?? 0;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1 text-[11px] text-gray-400 cursor-default">
          <Zap className="h-3 w-3" />
          {input} in · {output} out
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {(message.totalTokens ?? input + output).toLocaleString()} tokens total
        {message.estimatedCostUsd != null && ` · $${message.estimatedCostUsd.toFixed(4)}`}
      </TooltipContent>
    </Tooltip>
  );
}

function UserBubble({ message }: { message: AssistantMessage }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-end gap-2 max-w-[80%]">
        <div className="rounded-2xl rounded-br-md bg-[var(--color-primary,#7C3AED)] text-white px-4 py-2.5 text-sm whitespace-pre-wrap shadow-sm">
          {message.content}
        </div>
        <div className="h-7 w-7 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center shrink-0">
          <UserIcon className="h-3.5 w-3.5" />
        </div>
      </div>
      <span className="text-[11px] text-gray-400 pr-9">{formatDateTime(message.createdAt)}</span>
    </div>
  );
}

function AssistantBubble({ message }: { message: AssistantMessage }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex items-start gap-2 max-w-[85%]">
        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-violet-500 to-violet-700 text-white flex items-center justify-center shrink-0 mt-0.5">
          <Bot className="h-3.5 w-3.5" />
        </div>
        <div className="rounded-2xl rounded-tl-md bg-gray-50 border border-gray-100 px-4 py-3 min-w-0">
          <ResponseBlocks blocks={message.contentBlocks ?? [{ type: "paragraph", text: message.content }]} />
          {message.toolCalls && message.toolCalls.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2.5 border-t border-gray-100">
              {message.toolCalls.map((call, j) => (
                <Badge key={j} variant={call.status === "success" ? "success" : "danger"}>
                  {call.toolName}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 pl-9">
        <span className="text-[11px] text-gray-400">{formatDateTime(message.createdAt)}</span>
        <TokenUsage message={message} />
      </div>
    </div>
  );
}

interface AssistantThreadProps {
  sessionId: string | null;
}

export function AssistantThread({ sessionId }: AssistantThreadProps) {
  const [question, setQuestion] = useState("");
  const qc = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: session, isLoading } = useQuery({
    queryKey: ["ai-assistant-session", sessionId],
    queryFn: () => getAssistantSession(sessionId!),
    enabled: !!sessionId,
  });

  const askMutation = useMutation({
    mutationFn: (q: string) => askInSession(sessionId!, q),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-assistant-session", sessionId] });
      qc.invalidateQueries({ queryKey: ["ai-assistant-sessions"] }); // title/lastMessageAt may have changed
      setQuestion("");
    },
    onError: (err) => toast({ variant: "destructive", title: extractError(err) }),
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [session?.messages.length, askMutation.isPending]);

  function handleAsk() {
    const trimmed = question.trim();
    if (!trimmed || askMutation.isPending) return;
    askMutation.mutate(trimmed);
  }

  if (!sessionId) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <EmptyState icon={Bot} title="Select or start a conversation" description='Try "What SBI recruitments are currently listed?" or "Any recent banking current affairs?"' />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full flex-1 min-w-0 bg-white">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
        {isLoading ? (
          <div className="max-w-3xl mx-auto space-y-5">
            <Skeleton className="h-14 w-2/3 ml-auto rounded-2xl" />
            <Skeleton className="h-24 w-3/4 rounded-2xl" />
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-5">
            {session?.messages.map((m) => (m.role === "user" ? <UserBubble key={m.id} message={m} /> : <AssistantBubble key={m.id} message={m} />))}
            {askMutation.isPending && (
              <div className="flex items-start gap-2">
                <div className="h-7 w-7 rounded-full bg-gradient-to-br from-violet-500 to-violet-700 text-white flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="h-3.5 w-3.5" />
                </div>
                <div className="rounded-2xl rounded-tl-md bg-gray-50 border border-gray-100 px-4 py-1">
                  <TypingIndicator />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-gray-100 bg-white p-4">
        <div className="max-w-3xl mx-auto flex items-end gap-2 bg-gray-50 rounded-2xl border border-gray-200 p-2 focus-within:border-violet-300 focus-within:ring-2 focus-within:ring-violet-100 transition-colors">
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleAsk();
              }
            }}
            placeholder="Ask a question…"
            rows={1}
            disabled={askMutation.isPending}
            className="border-0 bg-transparent shadow-none focus-visible:ring-0 resize-none min-h-[40px] py-2"
          />
          <Button
            size="icon"
            className="rounded-full h-9 w-9 shrink-0"
            onClick={handleAsk}
            disabled={askMutation.isPending || !question.trim()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
