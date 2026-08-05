import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Loader2, RefreshCw, ScrollText, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { BackLink } from "@/components/back-link";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  backfillOwnerSeats,
  clearOrganizationSubscription,
  deleteOrganization,
  listOrganizations,
  updateOrganization,
  type OrgRow,
} from "@/lib/admin.functions";
import { APP_PLANS, APP_STATUSES } from "@/lib/billing-rules";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Superadmin · Accounts & subscriptions" },
      {
        name: "description",
        content:
          "Review every Meridian account, edit plans, statuses and seats, and repair billing rule violations.",
      },
      { property: "og:title", content: "Superadmin · Accounts & subscriptions" },
      {
        property: "og:description",
        content: "Edit plans, statuses and seats across every Meridian account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const load = useServerFn(listOrganizations);
  const save = useServerFn(updateOrganization);
  const backfill = useServerFn(backfillOwnerSeats);
  const remove = useServerFn(deleteOrganization);
  const clearSub = useServerFn(clearOrganizationSubscription);

  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await load();
      setOrgs(res.orgs);
      setSummary(res.summary as unknown as Record<string, number>);
      setDenied(null);
    } catch (error) {
      setDenied(error instanceof Error ? error.message : "Could not load accounts.");
    }
    setLoading(false);
  }, [load]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = orgs.filter((o) =>
    query.trim()
      ? `${o.email ?? ""} ${o.firmName ?? ""} ${o.fullName ?? ""}`
          .toLowerCase()
          .includes(query.trim().toLowerCase())
      : true,
  );

  if (denied) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl">Superadmin</h1>
        <p className="mt-3 text-sm text-muted-foreground">{denied}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <BackLink />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-caps">Superadmin</p>
          <h1 className="mt-1 text-4xl">Accounts &amp; subscriptions</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Every edit here goes through the same rulebook the webhook uses — seats are clamped to
            the plan, and each change is stamped and written to the billing log. Your own
            superadmin account is listed too, so you can run a plan of your own — but it can never
            be deleted from here.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void refresh()}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          <Button asChild variant="outline">
            <Link to="/billing">My plan</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/webhook-audit">
              <ScrollText className="h-4 w-4" /> Billing log
            </Link>
          </Button>
          <Button
            onClick={async () => {
              try {
                const res = await backfill();
                toast.success(`Created ${res.created} missing owner seats.`);
                void refresh();
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Backfill failed");
              }
            }}
          >
            Repair owner seats
          </Button>
        </div>
      </div>

      {summary ? (
        <div className="mt-8 grid gap-3 sm:grid-cols-5">
          {[
            { label: "Accounts", value: summary["total"] },
            { label: "Paid", value: summary["paid"] },
            { label: "Seats assigned", value: summary["seatsAssigned"] },
            { label: "No Polar account", value: summary["withoutPolar"] },
            { label: "Rule warnings", value: summary["withWarnings"] },
          ].map((s) => (
            <div key={s.label} className="panel px-4 py-3">
              <p className="label-caps">{s.label}</p>
              <p className="mt-1 text-2xl">{s.value ?? 0}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="relative mt-8">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search by email, fund or name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="mt-6 space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading accounts…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No accounts match that search.</p>
        ) : (
          filtered.map((org) => (
            <OrgCard
              key={org.userId}
              org={org}
              open={editing === org.userId}
              onToggle={() => setEditing(editing === org.userId ? null : org.userId)}
              onDelete={async (confirmEmail) => {
                await remove({ data: { userId: org.userId, confirmEmail } });
                toast.success("Account deleted.");
                setEditing(null);
                void refresh();
              }}
              onClearSubscription={async (reason) => {
                await clearSub({ data: { userId: org.userId, reason } });
                toast.success("Subscription removed — the account and its roles are untouched.");
                void refresh();
              }}
              onSave={async (input) => {
                try {
                  await save({ data: { userId: org.userId, ...input } });
                  toast.success("Subscription updated.");
                  setEditing(null);
                  void refresh();
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Update failed");
                }
              }}
            />
          ))
        )}
      </div>
    </main>
  );
}

type EditInput = {
  plan: (typeof APP_PLANS)[number];
  status: (typeof APP_STATUSES)[number];
  seats: number;
  polarCustomerId: string | null;
  polarSubscriptionId: string | null;
  reason: string;
};

function OrgCard({
  org,
  open,
  onToggle,
  onSave,
  onDelete,
  onClearSubscription,
}: {
  org: OrgRow;
  open: boolean;
  onToggle: () => void;
  onSave: (input: EditInput) => Promise<void>;
  onDelete: (confirmEmail: string) => Promise<void>;
  onClearSubscription: (reason: string) => Promise<void>;
}) {
  const [plan, setPlan] = useState(org.plan);
  const [status, setStatus] = useState(org.status);
  const [seats, setSeats] = useState(String(org.seats));
  const [customerId, setCustomerId] = useState(org.polarCustomerId ?? "");
  const [subscriptionId, setSubscriptionId] = useState(org.polarSubscriptionId ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [clearing, setClearing] = useState(false);

  return (
    <section className="panel px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm">{org.firmName || org.fullName || org.email}</p>
          <p className="text-xs text-muted-foreground">
            {org.email} · {org.investorType} · {org.seatsUsed} of{" "}
            {org.ceiling === null ? "unlimited" : org.ceiling} seats used
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={org.plan === "trial" ? "secondary" : "default"}>{org.plan}</Badge>
          <Badge variant="outline">{org.status}</Badge>
          {org.manualOverrideAt ? <Badge variant="outline">manual override</Badge> : null}
          <Button variant="outline" size="sm" onClick={onToggle}>
            {open ? "Close" : "Edit"}
          </Button>
        </div>
      </div>

      {org.warnings.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {org.warnings.map((w) => (
            <li key={w} className="flex items-start gap-2 text-xs text-primary">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {w}
            </li>
          ))}
        </ul>
      ) : null}

      {open ? (
        <form
          className="mt-4 grid gap-3 border-t border-border/70 pt-4 md:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            await onSave({
              plan: plan as EditInput["plan"],
              status: status as EditInput["status"],
              seats: Number(seats) || 1,
              polarCustomerId: customerId.trim() || null,
              polarSubscriptionId: subscriptionId.trim() || null,
              reason,
            });
            setBusy(false);
          }}
        >
          <label className="text-xs text-muted-foreground">
            Plan
            <Select value={plan} onValueChange={setPlan}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {APP_PLANS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="text-xs text-muted-foreground">
            Status
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {APP_STATUSES.filter(
                  (s) => s !== "trialing" || plan === "trial" || plan === "angel",
                ).map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="text-xs text-muted-foreground">
            Paid seats
            <Input
              className="mt-1"
              type="number"
              min={1}
              value={seats}
              onChange={(e) => setSeats(e.target.value)}
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Polar customer id
            <Input
              className="mt-1"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              placeholder="optional"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Polar subscription id
            <Input
              className="mt-1"
              value={subscriptionId}
              onChange={(e) => setSubscriptionId(e.target.value)}
              placeholder="optional"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Reason for this change
            <Input
              className="mt-1"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. comped 5 seats for pilot"
              required
              minLength={3}
              maxLength={280}
            />
          </label>
          <div className="md:col-span-2">
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save subscription
            </Button>
          </div>
        </form>
      ) : null}

      {open ? (
        <div className="mt-4 grid gap-3 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 md:grid-cols-[1fr_auto] md:items-end">
          <label className="text-xs text-muted-foreground">
            Delete this account permanently — type{" "}
            <span className="text-foreground">{org.email}</span> to confirm. Seats, deals access,
            profile and billing links are removed.
            <Input
              className="mt-1"
              value={confirmDelete}
              onChange={(e) => setConfirmDelete(e.target.value)}
              placeholder={org.email ?? "email"}
            />
          </label>
          <Button
            type="button"
            variant="destructive"
            disabled={deleting || confirmDelete.trim().toLowerCase() !== (org.email ?? "")}
            onClick={async () => {
              setDeleting(true);
              try {
                await onDelete(confirmDelete.trim());
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Delete failed");
              }
              setDeleting(false);
            }}
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete account
          </Button>
        </div>
      ) : null}
    </section>
  );
}
