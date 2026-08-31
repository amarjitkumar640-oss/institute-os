import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, MessageSquare } from "lucide-react";
import { listAssistantSessions, createAssistantSession, deleteAssistantSession } from "@/api/govExams";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { cn, formatDateTime } from "@/lib/utils";

interface AssistantSessionListProps {
  selectedSessionId: string | null;
  onSelect: (sessionId: string) => void;
  onSessionDeleted: (sessionId: string) => void;
}

export function AssistantSessionList({ selectedSessionId, onSelect, onSessionDeleted }: AssistantSessionListProps) {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ["ai-assistant-sessions"], queryFn: listAssistantSessions });

  const createMutation = useMutation({
    mutationFn: createAssistantSession,
    onSuccess: (session) => {
      qc.invalidateQueries({ queryKey: ["ai-assistant-sessions"] });
      onSelect(session.id);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAssistantSession,
    onSuccess: (_data, sessionId) => {
      qc.invalidateQueries({ queryKey: ["ai-assistant-sessions"] });
      onSessionDeleted(sessionId);
    },
  });

  const sessions = data?.sessions ?? [];

  return (
    <div className="flex flex-col h-full w-72 shrink-0" style={{ borderRight: "1px solid rgba(109,40,217,0.07)" }}>
      <div className="p-3">
        <Button size="sm" className="w-full" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
          <Plus className="h-4 w-4" /> New chat
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
        {isLoading ? (
          [...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)
        ) : sessions.length === 0 ? (
          <EmptyState icon={MessageSquare} title="No conversations yet" description="Start a new chat to ask about recruitments, organizations, or current affairs." />
        ) : (
          sessions.map((session) => (
            <div
              key={session.id}
              className={cn(
                "group flex items-center gap-1 rounded-lg px-3 py-2 cursor-pointer text-sm",
                session.id === selectedSessionId ? "bg-violet-50 text-violet-900" : "hover:bg-gray-50 text-gray-700",
              )}
              onClick={() => onSelect(session.id)}
            >
              <div className="flex-1 min-w-0">
                <p className="truncate font-medium">{session.title ?? "New conversation"}</p>
                {session.lastMessageAt && <p className="text-xs text-gray-400">{formatDateTime(session.lastMessageAt)}</p>}
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-600 opacity-0 group-hover:opacity-100 shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm("Delete this conversation? This can't be undone.")) deleteMutation.mutate(session.id);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
