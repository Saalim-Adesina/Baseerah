import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";
import { createThread, getDealThreads } from "@/lib/store";

export const Route = createFileRoute("/_authenticated/deals/$dealId/chat/")({
  component: ChatIndex,
});

function ChatIndex() {
  const { dealId } = Route.useParams();
  const navigate = useNavigate();
  const go = useCallback(() => {
    const existing = getDealThreads(dealId);
    const thread = existing[0] ?? createThread(dealId, "Initial read");
    void navigate({
      to: "/deals/$dealId/chat/$threadId",
      params: { dealId, threadId: thread.id },
      replace: true,
    });
  }, [dealId, navigate]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    go();
  }, [go]);

  return <p className="mt-10 text-sm text-muted-foreground">Opening discussion…</p>;
}
