import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BackLink } from "@/components/back-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listWebhookEvents, type WebhookAuditRow } from "@/lib/webhook-audit.functions";

export const Route = createFileRoute("/_authenticated/webhook-audit")({
  head: () => ({
    meta: [
      { title: "Billing webhook audit — Meridian" },
      {
        name: "description",
        content:
          "Inspect incoming Polar billing events, how each was mapped to an account, and the plan and seat changes applied.",
      },
      { property: "og:title", content: "Billing webhook audit — Meridian" },
      {
        property: "og:description",
        content: "Incoming billing events, mapping decisions and resulting plan and seat updates.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WebhookAudit,
});

const OUTCOME_STYLES: Record<string, string> = {
  applied: "border-primary text-primary",
  unmatched: "border-amber-500 text-amber-500",
  error: "border-destructive text-destructive",
  rejected: "border-destructive text-destructive",
  ignored: "border-border text-muted-foreground",
};

function WebhookAudit() {
  const load = useServerFn(listWebhookEvents);
  const [rows, setRows] = useState<WebhookAuditRow[]>([]);
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [outcome, setOutcome] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await load({ data: { outcome, search: search || undefined, limit: 100 } });
      setRows(res.events as WebhookAuditRow[]);
      setSummary(res.summary as unknown as Record<string, number>);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the webhook audit.");
    } finally {
      setLoading(false);
    }
  }, [load, outcome, search]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <BackLink />
      <p className="label-caps">Admin</p>
      <h1 className="mt-1 text-4xl">Billing webhook audit</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Every billing event we receive, the account it was matched to, how the plan and seats were
        resolved, and exactly what was written to the account.
      </p>

      {summary ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          {[
            ["Events shown", summary["total"]],
            ["Applied", summary["applied"]],
            ["Unmatched", summary["unmatched"]],
            ["Failed", summary["failed"]],
          ].map(([label, value]) => (
            <div key={String(label)} className="panel px-4 py-3">
              <p className="label-caps">{label}</p>
              <p className="mt-1 font-display text-3xl">{value ?? 0}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Input
          className="max-w-xs"
          placeholder="Search email, subscription or customer id"
          value={search}
          maxLength={120}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={outcome} onValueChange={setOutcome}>
          <SelectTrigger className="w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["all", "applied", "unmatched", "error", "rejected", "ignored"].map((o) => (
              <SelectItem key={o} value={o}>
                {o === "all" ? "All outcomes" : o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh
        </Button>
      </div>

      {error ? (
        <div className="panel mt-6 px-6 py-5 text-sm text-destructive">{error}</div>
      ) : loading ? (
        <p className="mt-6 text-sm text-muted-foreground">Loading events…</p>
      ) : rows.length === 0 ? (
        <div className="panel mt-6 px-6 py-8 text-sm text-muted-foreground">
          No webhook events recorded yet. Events appear here as soon as the billing provider posts
          them to this app.
        </div>
      ) : (
        <div className="panel mt-6 divide-y divide-border/70">
          {rows.map((r) => (
            <div key={r.id} className="px-5 py-4">
              <button
                type="button"
                className="flex w-full flex-wrap items-center justify-between gap-3 text-left"
                onClick={() => setOpen(open === r.id ? null : r.id)}
              >
                <div>
                  <p className="text-sm">
                    <span className="font-medium">{r.event_type}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {r.matched_email ?? r.external_customer_id ?? "no account match"}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(r.received_at).toLocaleString()} ·{" "}
                    {r.mapped_plan ? `plan ${r.mapped_plan}` : "no plan change"} ·{" "}
                    {r.mapped_seats ? `${r.mapped_seats} seats` : "seats unchanged"} · mapped via{" "}
                    {r.mapping_source ?? "—"}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={OUTCOME_STYLES[r.outcome] ?? "border-border text-muted-foreground"}
                >
                  {r.outcome}
                </Badge>
              </button>

              {open === r.id ? (
                <div className="mt-3 grid gap-3 border-t border-border/60 pt-3 text-xs md:grid-cols-2">
                  <div className="space-y-1 text-muted-foreground">
                    <p>
                      <span className="text-foreground">Decision:</span> {r.notes ?? "—"}
                    </p>
                    <p>Product: {r.polar_product_id ?? "—"}</p>
                    <p>Subscription: {r.polar_subscription_id ?? "—"}</p>
                    <p>Customer: {r.polar_customer_id ?? "—"}</p>
                    <p>External id: {r.external_customer_id ?? "—"}</p>
                    <p>Signature valid: {r.signature_valid ? "yes" : "no"}</p>
                  </div>
                  <div>
                    <p className="label-caps">Applied to account</p>
                    <pre className="mt-1 overflow-x-auto rounded bg-secondary/60 p-3 text-[11px] leading-relaxed">
                      {r.applied_row
                        ? JSON.stringify(r.applied_row, null, 2)
                        : "Nothing was written."}
                    </pre>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
