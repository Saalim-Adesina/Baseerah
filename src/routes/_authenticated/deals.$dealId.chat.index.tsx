import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";
import { createThread, loadThreads } from "@/lib/store";

export const Route = createFileRoute("/_authenticated/deals/$dealId/chat/")({
  component: ChatIndex,
});

function ChatIndex() {
  const { dealId } = Route.useParams();
  const navigate = useNavigate();
  const go = useCallback(async () => {
    // Threads live server-side now, so the list has to arrive before deciding
    // whether to reuse the newest one or open a fresh discussion.
    const existing = await loadThreads(dealId);
    const thread = existing[0] ?? (await createThread(dealId, "Initial read"));
    void navigate({
      to: "/deals/$dealId/chat/$threadId",
      params: { dealId, threadId: thread.id },
      replace: true,
    });
  }, [dealId, navigate]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    void go();
  }, [go]);

  return <p className="mt-10 text-sm text-muted-foreground">Opening discussion…</p>;
}
