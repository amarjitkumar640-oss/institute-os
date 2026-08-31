import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listAssistantSessions } from "@/api/govExams";
import { AssistantSessionList } from "./AssistantSessionList";
import { AssistantThread } from "./AssistantThread";

export function AiAssistantTab() {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const { data } = useQuery({ queryKey: ["ai-assistant-sessions"], queryFn: listAssistantSessions });

  // Reopening the tab drops you back into your most recent conversation,
  // same as any real chat app — this is what makes history survive reload.
  useEffect(() => {
    if (selectedSessionId === null && data?.sessions.length) {
      setSelectedSessionId(data.sessions[0]!.id);
    }
  }, [data, selectedSessionId]);

  return (
    <div className="flex h-[calc(100vh-220px)] bg-white rounded-xl border border-gray-100 overflow-hidden">
      <AssistantSessionList
        selectedSessionId={selectedSessionId}
        onSelect={setSelectedSessionId}
        onSessionDeleted={(deletedId) => {
          if (deletedId === selectedSessionId) setSelectedSessionId(null);
        }}
      />
      <AssistantThread sessionId={selectedSessionId} />
    </div>
  );
}
