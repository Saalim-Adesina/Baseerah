import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertTriangle,
  ClipboardCopy,
  FileText,
  Loader2,
  Mail,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScoreBar, scoreColor } from "@/components/score";
import { analyzeDeal, generateMemo, generatePassEmail } from "@/lib/deal-ai.functions";
import { getDeal, getThesis, updateDeal, useHydrated, useStoreValue } from "@/lib/store";
import type { Analysis, Deal } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/deals/$dealId/")({
  component: DealAnalysis,
});

function DealAnalysis() {
  const { dealId } = Route.useParams();
  const navigate = useNavigate();
  const hydrated = useHydrated();
  const selector = useCallback(() => getDeal(dealId), [dealId]);
  const deal = useStoreValue(selector);
  const [busy, setBusy] = useState<"analysis" | "memo" | "email" | null>(null);

  if (!hydrated || !deal) return null;
  const analysis = deal.analysis;

  const run = async (kind: "analysis" | "memo" | "email") => {
    setBusy(kind);
    const thesis = getThesis();
    try {
      const current = getDeal(dealId) as Deal;
      if (kind === "analysis") {
        const result = (await analyzeDeal({
          data: { deal: current, thesis },
        })) as unknown as Omit<Analysis, "generatedAt">;
        await updateDeal(dealId, {
          analysis: { ...result, generatedAt: Date.now() } as Analysis,
          status: current.status === "new" ? "analyzed" : current.status,
        });
        toast.success("Screening complete");
      } else if (kind === "memo") {
        const result = await generateMemo({ data: { deal: current, thesis } });
        await updateDeal(dealId, { memo: result.memo });
        toast.success("IC memo drafted");
      } else {
        const result = await generatePassEmail({ data: { deal: current, thesis } });
        await updateDeal(dealId, {
          passEmail: { ...result, generatedAt: Date.now() },
          status: "passed",
        });
        toast.success("Pass email drafted");
      }
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Request failed";
      // The screening meter refuses with a plan-shaped message; give those a
      // route to fix it rather than a dead-end toast.
      if (/screening|trial has ended|no active subscription/i.test(message)) {
        toast.error(message, {
          action: { label: "Billing", onClick: () => void navigate({ to: "/billing" }) },
        });
      } else {
        toast.error(message);
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-6 space-y-5">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => run("analysis")} disabled={busy !== null}>
          {busy === "analysis" ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : analysis ? (
            <RefreshCw className="mr-1 h-4 w-4" />
          ) : (
            <Sparkles className="mr-1 h-4 w-4" />
          )}
          {analysis ? "Re-run screening" : "Run screening"}
        </Button>
        <Button variant="outline" onClick={() => run("memo")} disabled={busy !== null}>
          {busy === "memo" ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <FileText className="mr-1 h-4 w-4" />
          )}
          IC memo
        </Button>
        <Button variant="outline" onClick={() => run("email")} disabled={busy !== null}>
          {busy === "email" ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Mail className="mr-1 h-4 w-4" />
          )}
          Pass email
        </Button>
        <div className="ml-auto flex gap-2">
          {(["shortlist", "analyzed", "passed"] as const).map((status) => (
            <Button
              key={status}
              size="sm"
              variant={deal.status === status ? "default" : "ghost"}
              onClick={() => {
                void updateDeal(dealId, { status }).catch((error: unknown) =>
                  toast.error(error instanceof Error ? error.message : "Could not update status"),
                );
              }}
            >
              {status}
            </Button>
          ))}
        </div>
      </div>

      {!analysis ? (
        <div className="panel px-6 py-16 text-center">
          <h2 className="text-2xl">Not screened yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Run the screening to score every metric against your thesis, calibrated to the{" "}
            {deal.round} stage, with the team weighted highest.
          </p>
        </div>
      ) : (
        <Tabs defaultValue="scores">
          <TabsList className="flex-wrap">
            <TabsTrigger value="scores">Scorecard</TabsTrigger>
            <TabsTrigger value="people">People & PMF</TabsTrigger>
            <TabsTrigger value="market">Moat & market</TabsTrigger>
            <TabsTrigger value="gaps">Gaps & questions</TabsTrigger>
            <TabsTrigger value="memo">IC memo</TabsTrigger>
            <TabsTrigger value="pass">Pass email</TabsTrigger>
          </TabsList>

          <TabsContent value="scores" className="mt-4 space-y-4">
            <div className="panel p-6">
              <p className="label-caps">Headline</p>
              <p className="mt-2 font-display text-2xl leading-snug">{analysis.headline}</p>
              <p className="mt-3 text-sm text-muted-foreground">{analysis.thesisFit}</p>
              <div className="mt-4 rounded-md border border-border bg-surface/60 p-4">
                <p className="label-caps">Round-stage calibration ({deal.round})</p>
                <p className="mt-1.5 text-sm">{analysis.roundFitNote}</p>
              </div>
            </div>
            <div className="panel divide-y divide-border">
              {analysis.metrics?.map((metric) => (
                <div key={metric.key} className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-lg">{metric.label}</h3>
                    <div className="w-full max-w-xs">
                      <ScoreBar score={metric.score} />
                    </div>
                  </div>
                  <p className="mt-2 text-sm">{metric.verdict}</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-md bg-surface/60 p-3">
                      <p className="label-caps">Evidence</p>
                      <p className="mt-1 text-sm text-muted-foreground">{metric.evidence}</p>
                    </div>
                    <div className="rounded-md bg-surface/60 p-3">
                      <p className="label-caps">Gap</p>
                      <p className="mt-1 text-sm text-muted-foreground">{metric.gap}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="people" className="mt-4 space-y-4">
            <div className="panel p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-2xl">Human capital</h3>
                <span
                  className="font-display text-3xl"
                  style={{ color: scoreColor(analysis.humanCapital?.score ?? 0) }}
                >
                  {analysis.humanCapital?.score?.toFixed(1)}
                </span>
              </div>
              <Block title="Founder–market fit" body={analysis.humanCapital?.founderMarketFit} />
              <Block
                title="LinkedIn / track record read"
                body={analysis.humanCapital?.linkedinRead}
              />
              <Block title="Meeting notes read" body={analysis.humanCapital?.meetingNotesRead} />
              <Block title="Bias check" body={analysis.humanCapital?.biasCheck} />
              <List title="Concerns" items={analysis.humanCapital?.concerns} tone="warn" />
            </div>
            <div className="panel p-6">
              <h3 className="text-2xl">Product–market fit</h3>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">
                {analysis.productMarketFit}
              </p>
            </div>
          </TabsContent>

          <TabsContent value="market" className="mt-4 space-y-4">
            <div className="panel p-6">
              <h3 className="text-2xl">Moat & defensibility</h3>
              <Block title="Read" body={analysis.moat?.read} />
              <Block title="Durability" body={analysis.moat?.durability} />
              <List title="Sources of advantage" items={analysis.moat?.sources} />
            </div>
            <div className="panel p-6">
              <h3 className="text-2xl">Unit economics</h3>
              <Block title="Read" body={analysis.unitEconomics?.read} />
              <Block title="Benchmarks for this stage" body={analysis.unitEconomics?.benchmarks} />
              <List title="Flags" items={analysis.unitEconomics?.flags} tone="warn" />
            </div>
            <div className="panel p-6">
              <h3 className="text-2xl">Competitive landscape</h3>
              <div className="mt-4 space-y-3">
                {analysis.competitors?.map((competitor) => (
                  <div
                    key={competitor.name}
                    className="rounded-md border border-border bg-surface/60 p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-medium">{competitor.name}</h4>
                      <Badge
                        variant="outline"
                        className="text-[10px] uppercase tracking-wider"
                        style={{
                          color:
                            competitor.threatLevel === "high"
                              ? "var(--signal-weak)"
                              : competitor.threatLevel === "medium"
                                ? "var(--signal-mid)"
                                : "var(--signal-strong)",
                        }}
                      >
                        {competitor.threatLevel} threat
                      </Badge>
                    </div>
                    <p className="mt-1.5 text-sm text-muted-foreground">{competitor.positioning}</p>
                    <p className="mt-1.5 text-sm">
                      <span className="label-caps">Our read: </span>
                      {competitor.differentiation}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="gaps" className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="panel p-6">
              <List title="What's missing" items={analysis.missingInformation} />
            </div>
            <div className="panel p-6">
              <List title="Questions for the founders" items={analysis.founderQuestions} />
            </div>
            <div className="panel p-6">
              <List title="Key risks" items={analysis.risks} tone="warn" />
            </div>
            <div className="panel p-6">
              <List title="Kill criteria" items={analysis.killCriteria} tone="warn" />
            </div>
          </TabsContent>

          <TabsContent value="memo" className="mt-4">
            <div className="panel p-6">
              {deal.memo ? (
                <>
                  <div className="mb-4 flex justify-end">
                    <Button variant="outline" size="sm" onClick={() => copy(deal.memo!)}>
                      <ClipboardCopy className="mr-1 h-4 w-4" /> Copy memo
                    </Button>
                  </div>
                  <div className="prose-memo max-w-none text-sm">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{deal.memo}</ReactMarkdown>
                  </div>
                </>
              ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No memo yet — click “IC memo” above to draft one from this analysis.
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="pass" className="mt-4">
            <div className="panel p-6">
              {deal.passEmail ? (
                <>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="label-caps">Subject</p>
                      <p className="mt-1 text-lg">{deal.passEmail.subject}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        copy(`Subject: ${deal.passEmail!.subject}\n\n${deal.passEmail!.body}`)
                      }
                    >
                      <ClipboardCopy className="mr-1 h-4 w-4" /> Copy
                    </Button>
                  </div>
                  <p className="mt-5 whitespace-pre-wrap text-sm leading-relaxed">
                    {deal.passEmail.body}
                  </p>
                </>
              ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Disregard this deal with a written explanation — click “Pass email” above.
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function copy(text: string) {
  void navigator.clipboard.writeText(text);
  toast.success("Copied to clipboard");
}

function Block({ title, body }: { title: string; body?: string }) {
  if (!body) return null;
  return (
    <div className="mt-4">
      <p className="label-caps">{title}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{body}</p>
    </div>
  );
}

function List({ title, items, tone }: { title: string; items?: string[]; tone?: "warn" }) {
  return (
    <div className="mt-4 first:mt-0">
      <p className="label-caps">{title}</p>
      {items?.length ? (
        <ul className="mt-2 space-y-2">
          {items.map((item) => (
            <li key={item} className="flex gap-2 text-sm leading-relaxed">
              {tone === "warn" ? (
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--signal-mid)]" />
              ) : (
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
              )}
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">None identified.</p>
      )}
    </div>
  );
}
