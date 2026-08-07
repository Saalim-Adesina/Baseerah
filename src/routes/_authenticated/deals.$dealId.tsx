import { createFileRoute, Link, Outlet, useMatchRoute } from "@tanstack/react-router";
import { useCallback } from "react";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getDeal, useHydrated, useStoreValue } from "@/lib/store";
import { ScoreRing } from "@/components/score";

export const Route = createFileRoute("/_authenticated/deals/$dealId")({
  head: () => ({
    meta: [
      { title: "Deal analysis — Baseerah Investment Screening" },
      {
        name: "description",
        content:
          "Metric-level scoring, human-capital read, moat and unit economics analysis, IC memo and deal chat for a single startup deal.",
      },
      { property: "og:title", content: "Deal analysis — Baseerah" },
      {
        property: "og:description",
        content: "Scores, gaps, founder questions, IC memo and deal chat in one workspace.",
      },
    ],
  }),
  component: DealLayout,
});

function DealLayout() {
  const { dealId } = Route.useParams();
  const hydrated = useHydrated();
  const selector = useCallback(() => getDeal(dealId), [dealId]);
  const deal = useStoreValue(selector);
  const matchRoute = useMatchRoute();
  const onChat = Boolean(matchRoute({ to: "/deals/$dealId/chat", fuzzy: true }));

  if (!hydrated) return null;

  if (!deal) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-24 text-center">
        <h1 className="text-3xl">Deal not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          It may have been deleted from this browser.
        </p>
        <Link to="/" className="mt-6 inline-block text-primary underline">
          Back to pipeline
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-5 py-8">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Pipeline
      </Link>

      <header className="mt-4 flex flex-wrap items-center gap-5">
        <ScoreRing value={deal.analysis?.overallScore ?? 0} size={76} label="score" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-4xl leading-none">{deal.company}</h1>
            <Badge variant="outline" className="font-mono text-[10px]">
              {deal.round}
            </Badge>
            {deal.analysis ? (
              <Badge className="text-[10px] uppercase tracking-wider">
                {deal.analysis.recommendation}
              </Badge>
            ) : null}
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {deal.oneLiner || deal.sector || "No summary"}
            {deal.raising ? ` · raising ${deal.raising}` : ""}
            {deal.valuation ? ` · ${deal.valuation}` : ""}
          </p>
        </div>
      </header>

      <nav className="mt-6 flex gap-1 border-b border-border">
        <Link
          to="/deals/$dealId"
          params={{ dealId }}
          activeOptions={{ exact: true }}
          className={`-mb-px border-b-2 px-4 py-2 text-sm transition-colors ${
            onChat
              ? "border-transparent text-muted-foreground hover:text-foreground"
              : "border-primary text-foreground"
          }`}
        >
          Analysis
        </Link>
        <Link
          to="/deals/$dealId/chat"
          params={{ dealId }}
          className={`-mb-px border-b-2 px-4 py-2 text-sm transition-colors ${
            onChat
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Discussions
        </Link>
      </nav>

      <Outlet />
    </main>
  );
}
