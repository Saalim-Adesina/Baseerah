import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { Plus, Search, Trash2, Sparkles, Copy, Inbox } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { deleteDeal, getDeals, useHydrated, useStoreValue } from "@/lib/store";
import { ScoreRing } from "@/components/score";
import { inboxAddress, useAccount } from "@/lib/account";
import type { Deal } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/pipeline")({
  head: () => ({
    meta: [
      { title: "Deal Pipeline — Meridian Angel Screening" },
      {
        name: "description",
        content:
          "Your screened angel deal flow: forwarded decks scored against your thesis, ranked and triaged.",
      },
      { property: "og:title", content: "Deal Pipeline — Meridian Angel Screening" },
      {
        property: "og:description",
        content: "Forwarded decks scored against your angel thesis, ranked and triaged.",
      },
    ],
  }),
  component: Pipeline,
});

const STATUS_STYLE: Record<Deal["status"], string> = {
  new: "bg-secondary text-secondary-foreground",
  analyzed: "bg-primary/15 text-primary",
  shortlist: "bg-[var(--signal-strong)]/15 text-[var(--signal-strong)]",
  passed: "bg-[var(--signal-weak)]/15 text-[var(--signal-weak)]",
};

function Pipeline() {
  const hydrated = useHydrated();
  const selector = useCallback(() => getDeals(), []);
  const deals = useStoreValue(selector);
  const [query, setQuery] = useState("");
  const { profile, subscription } = useAccount();

  const address = profile ? (profile.deal_inbox_email ?? inboxAddress(profile.id)) : "";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return deals;
    return deals.filter((deal) =>
      [deal.company, deal.sector, deal.oneLiner, deal.round].join(" ").toLowerCase().includes(q),
    );
  }, [deals, query]);

  const stats = useMemo(() => {
    const scored = deals.filter((d) => d.analysis);
    const avg = scored.length
      ? Math.round(
          scored.reduce((sum, d) => sum + (d.analysis?.overallScore ?? 0), 0) / scored.length,
        )
      : 0;
    return {
      total: deals.length,
      scored: scored.length,
      shortlist: deals.filter((d) => d.status === "shortlist").length,
      avg,
    };
  }, [deals]);

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-caps">Screening desk</p>
          <h1 className="mt-1 text-4xl">Deal pipeline</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Every deal that lands in your inbox is scored against your thesis, calibrated to its
            round stage, and judged on the people first.
          </p>
        </div>
        <Button asChild size="lg">
          <Link to="/deals/new">
            <Plus className="mr-1 h-4 w-4" /> Add deal
          </Link>
        </Button>
      </div>

      <div className="panel mt-6 flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="flex items-center gap-3">
          <Inbox className="h-5 w-5 text-primary" />
          <div>
            <p className="label-caps">Your private deal inbox</p>
            <p className="font-mono text-sm">{address || "…"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {subscription ? (
            <Badge variant="outline" className="font-mono text-[10px] uppercase">
              {subscription.plan} · {subscription.status}
            </Badge>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (!address) return;
              void navigator.clipboard.writeText(address);
              toast.success("Inbox address copied — forward decks here");
            }}
          >
            <Copy className="mr-1 h-3.5 w-3.5" /> Copy
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to="/billing">Manage plan</Link>
          </Button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Deals in pipeline", value: stats.total },
          { label: "Screened", value: stats.scored },
          { label: "Shortlisted", value: stats.shortlist },
          { label: "Avg. score", value: stats.avg || "—" },
        ].map((stat) => (
          <div key={stat.label} className="panel px-4 py-3">
            <p className="label-caps">{stat.label}</p>
            <p className="mt-1 font-display text-3xl">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="relative mt-8 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search company, sector, round…"
          className="pl-9"
        />
      </div>

      <div className="mt-5 space-y-3">
        {!hydrated ? null : filtered.length === 0 ? (
          <div className="panel flex flex-col items-center gap-3 px-6 py-16 text-center">
            <Sparkles className="h-6 w-6 text-primary" />
            <h2 className="text-xl">No deals yet</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              Forward a deck to your inbox address, or add one manually — the screener will score it
              against your thesis in one pass.
            </p>
            <Button asChild className="mt-2">
              <Link to="/deals/new">Add your first deal</Link>
            </Button>
          </div>
        ) : (
          filtered.map((deal) => (
            <Link
              key={deal.id}
              to="/deals/$dealId"
              params={{ dealId: deal.id }}
              className="panel flex items-center gap-5 px-5 py-4 transition-colors hover:border-primary/50"
            >
              <ScoreRing value={deal.analysis?.overallScore ?? 0} size={64} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl leading-tight">{deal.company}</h2>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {deal.round}
                  </Badge>
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] uppercase tracking-wider ${STATUS_STYLE[deal.status]}`}
                  >
                    {deal.status}
                  </span>
                  {deal.analysis ? (
                    <span className="text-xs text-muted-foreground">
                      · {deal.analysis.recommendation}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {deal.oneLiner || deal.sector || "No summary provided"}
                </p>
              </div>
              <button
                type="button"
                aria-label={`Delete ${deal.company}`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  deleteDeal(deal.id);
                }}
                className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </Link>
          ))
        )}
      </div>
    </main>
  );
}
