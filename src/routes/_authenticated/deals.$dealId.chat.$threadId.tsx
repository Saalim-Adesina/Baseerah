import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import { Loader2, MessageSquarePlus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  createThread,
  deleteThread,
  getDeal,
  getDealThreads,
  getThesis,
  getThread,
  saveThread,
  useHydrated,
  useStoreValue,
} from "@/lib/store";

export const Route = createFileRoute("/_authenticated/deals/$dealId/chat/$threadId")({
  component: ThreadPage,
});

const SUGGESTIONS = [
  "What would make this a conviction bet on the founders?",
  "Where is the deck overselling versus what's actually proven?",
  "Draft the five hardest questions for the next founder call.",
  "How defensible is this in 24 months if a large incumbent copies it?",
];

function ThreadPage() {
  const { dealId, threadId } = Route.useParams();
  const hydrated = useHydrated();
  const navigate = useNavigate();
  const dealSelector = useCallback(() => getDeal(dealId), [dealId]);
  const threadsSelector = useCallback(() => getDealThreads(dealId), [dealId]);
  const deal = useStoreValue(dealSelector);
  const threads = useStoreValue(threadsSelector);

  if (!hydrated || !deal) return null;

  return (
    <div className="mt-6 grid gap-5 lg:grid-cols-[240px_1fr]">
      <aside className="space-y-2">
        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={() => {
            const thread = createThread(dealId, `Discussion ${threads.length + 1}`);
            void navigate({
              to: "/deals/$dealId/chat/$threadId",
              params: { dealId, threadId: thread.id },
            });
          }}
        >
          <MessageSquarePlus className="mr-2 h-4 w-4" /> New thread
        </Button>
        <div className="space-y-1">
          {threads.map((thread) => (
            <div
              key={thread.id}
              className={`group flex items-center gap-1 rounded-md border px-1 transition-colors ${
                thread.id === threadId
                  ? "border-primary/60 bg-secondary"
                  : "border-transparent hover:bg-secondary/60"
              }`}
            >
              <Link
                to="/deals/$dealId/chat/$threadId"
                params={{ dealId, threadId: thread.id }}
                className="min-w-0 flex-1 truncate px-2 py-2 text-sm"
              >
                {thread.title}
              </Link>
              <button
                type="button"
                aria-label="Delete thread"
                className="rounded p-1.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                onClick={() => {
                  deleteThread(thread.id);
                  if (thread.id === threadId) {
                    void navigate({ to: "/deals/$dealId/chat", params: { dealId } });
                  }
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </aside>

      <ChatWindow key={threadId} dealId={dealId} threadId={threadId} />
    </div>
  );
}

function ChatWindow({ dealId, threadId }: { dealId: string; threadId: string }) {
  const stored = getThread(threadId);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status, error } = useChat({
    id: threadId,
    messages: (stored?.messages ?? []) as UIMessage[],
    transport: new DefaultChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest: ({ messages: msgs }) => ({
        body: { messages: msgs, deal: getDeal(dealId), thesis: getThesis() },
      }),
    }),
    onError: (err) => toast.error(err.message || "Chat request failed"),
  });

  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    inputRef.current?.focus();
  }, [threadId]);

  useEffect(() => {
    if (!busy) inputRef.current?.focus();
  }, [busy]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (status !== "ready" || messages.length === 0) return;
    const thread = getThread(threadId);
    if (!thread) return;
    const firstUser = messages.find((message) => message.role === "user");
    const title =
      thread.title.startsWith("Discussion") || thread.title === "Initial read"
        ? (textOf(firstUser) || thread.title).slice(0, 48)
        : thread.title;
    saveThread({ ...thread, title, messages, updatedAt: Date.now() });
  }, [messages, status, threadId]);

  const submit = () => {
    const value = input.trim();
    if (!value || busy) return;
    setInput("");
    void sendMessage({ text: value });
  };

  return (
    <section className="panel flex h-[70vh] flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <h2 className="text-2xl">Chat with this deal</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              The assistant has the deck, founder profiles, meeting notes, your thesis and the
              full scorecard in context.
            </p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void sendMessage({ text: suggestion })}
                  className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={message.role === "user" ? "flex justify-end" : "flex justify-start"}
            >
              <div
                className={`max-w-[85%] rounded-lg px-4 py-3 text-sm ${
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface border border-border"
                }`}
              >
                {message.role === "user" ? (
                  <p className="whitespace-pre-wrap">{textOf(message)}</p>
                ) : (
                  <div className="prose-memo max-w-none">
                    <ReactMarkdown>{textOf(message)}</ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        {status === "submitted" ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
          </div>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error.message}</p> : null}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-end gap-2 border-t border-border p-3">
        <Textarea
          ref={inputRef}
          rows={2}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="Ask about the founders, metrics, moat, risks…"
          className="resize-none"
        />
        <Button onClick={submit} disabled={busy || !input.trim()} size="icon" className="h-10 w-10">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </section>
  );
}

function textOf(message?: UIMessage) {
  if (!message) return "";
  return message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();
}
