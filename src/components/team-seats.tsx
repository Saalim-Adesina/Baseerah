import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Copy, CreditCard, Loader2, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SEAT_ROLES, type Plan, type SeatRole } from "@/lib/plans";
import { overageSeats, totalSeats } from "@/lib/seats";
import { startExtraSeatCheckout } from "@/lib/billing.functions";
import {
  assignSeat,
  getMySeats,
  removeSeat,
  updateSeatRole,
  type SeatRow,
} from "@/lib/seats.functions";

const inviteSchema = z.object({
  email: z.string().trim().email("Enter a valid work email").max(255),
  full_name: z.string().trim().max(100).optional(),
  role: z.enum(["admin", "analyst", "viewer"]),
});

export function TeamSeats({ plan, seats }: { plan: Plan; seats: number }) {
  const load = useServerFn(getMySeats);
  const add = useServerFn(assignSeat);
  const setRoleFn = useServerFn(updateSeatRole);
  const release = useServerFn(removeSeat);

  const [members, setMembers] = useState<SeatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<SeatRole>("analyst");
  const buySeats = useServerFn(startExtraSeatCheckout);
  const [buyQty, setBuyQty] = useState(1);
  const [buying, setBuying] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await load();
      setMembers(res.seats);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load seats");
    }
    setLoading(false);
  }, [load]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const total = totalSeats(plan, seats);
  const used = members.length;
  const ceiling = plan.maxSeats;
  const overage = overageSeats(plan, seats, used);
  // Seats are hard-capped at what has been paid for, so buying is the only way
  // the cap moves. Headroom is measured against the plan's absolute ceiling.
  const sellsSeats = plan.extraSeatCents !== null;
  // assignSeat rejects past the paid seat count, not the plan's hard ceiling, so
  // the invite form has to gate on the same number or it offers a seat the
  // server will refuse.
  const paidCap = ceiling === null ? Infinity : total;
  const atPaidLimit = used >= paidCap;
  const headroom = ceiling === null ? Infinity : Math.max(ceiling - total, 0);
  const canBuy = sellsSeats && headroom > 0;
  const buyCents = (plan.extraSeatCents ?? 0) * buyQty;
  const buyCost = buyCents % 100 === 0 ? buyCents / 100 : (buyCents / 100).toFixed(2);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const parsed = inviteSchema.safeParse({ email, full_name: name || undefined, role });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid invite");
      return;
    }
    setBusy(true);
    try {
      const res = await add({ data: parsed.data });
      setMembers(res.seats);
      setEmail("");
      setName("");
      toast.success("Seat assigned — share the invite link so they can join.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not assign that seat");
    }
    setBusy(false);
  }

  async function changeRole(id: string, next: string) {
    try {
      const res = await setRoleFn({ data: { id, role: next as SeatRole } });
      setMembers(res.seats);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change that role");
    }
  }

  async function remove(id: string) {
    try {
      const res = await release({ data: { id } });
      setMembers(res.seats);
      toast.success("Seat released.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not release that seat");
    }
  }

  async function buy(e: React.FormEvent) {
    e.preventDefault();
    setBuying(true);
    try {
      const { url } = await buySeats({ data: { seats: buyQty, origin: window.location.origin } });
      window.location.href = url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start that purchase.");
      setBuying(false);
    }
  }

  async function copyInvite(token: string | null) {
    if (!token) {
      toast.error("No invite link for this seat yet.");
      return;
    }
    const url = `${window.location.origin}/invite/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Invite link copied — send it to your teammate.");
    } catch {
      toast.info(url);
    }
  }

  return (
    <section className="panel mt-8 px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="label-caps">Team seats</p>
          <h2 className="mt-1 text-2xl">
            {used} of {ceiling === null ? "unlimited" : total} seats used
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {plan.name} includes {plan.seatsIncluded} seats
            {plan.extraSeatPrice && plan.extraSeatPrice !== "Included"
              ? ` — extra seats are ${plan.extraSeatPrice}`
              : ""}
            . Your own admin seat is the first one listed; every other teammate gets their own login
            into the shared pipeline.
          </p>
        </div>
        {overage > 0 ? (
          <Badge variant="outline" className="border-primary text-primary">
            {overage} seat{overage > 1 ? "s" : ""} over — billed at renewal
          </Badge>
        ) : null}
      </div>

      {canBuy ? (
        <form
          onSubmit={buy}
          className="mt-5 flex flex-wrap items-center gap-3 rounded-md border border-border/70 bg-secondary/40 px-4 py-3"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Need more seats?</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {atPaidLimit
                ? `You've used all ${total} seats. Buy more to keep adding teammates.`
                : `Seats are capped at what you've paid for — ${used} of ${total} in use.`}
            </p>
          </div>
          <Input
            type="number"
            min={1}
            max={Number.isFinite(headroom) ? headroom : undefined}
            value={buyQty}
            onChange={(e) =>
              setBuyQty(Math.max(1, Math.min(Number(e.target.value) || 1, headroom)))
            }
            className="w-20"
            aria-label="Seats to buy"
          />
          <Button type="submit" variant="secondary" disabled={buying}>
            {buying ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CreditCard className="h-4 w-4" />
            )}
            Buy {buyQty} seat{buyQty > 1 ? "s" : ""} — ${buyCost}/mo
          </Button>
        </form>
      ) : null}

      <form onSubmit={invite} className="mt-5 grid gap-3 md:grid-cols-[1.4fr_1fr_auto_auto]">
        <Input
          type="email"
          placeholder="teammate@fund.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={255}
          required
        />
        <Input
          placeholder="Full name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
        />
        <Select value={role} onValueChange={(v) => setRole(v as SeatRole)}>
          <SelectTrigger className="md:w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SEAT_ROLES.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" disabled={busy || atPaidLimit}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Assign seat
        </Button>
      </form>

      <div className="mt-6 divide-y divide-border/70 border-t border-border/70">
        {loading ? (
          <p className="py-4 text-sm text-muted-foreground">Loading seats…</p>
        ) : members.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            No seats yet — reload to create your owner admin seat.
          </p>
        ) : (
          members.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm">
                  {m.full_name || m.email}
                  {m.is_owner ? (
                    <Badge variant="secondary" className="ml-2">
                      Owner
                    </Badge>
                  ) : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  {m.email} ·{" "}
                  {m.accepted_at
                    ? `Joined ${new Date(m.accepted_at).toLocaleDateString()}`
                    : "Invite pending"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={m.role}
                  onValueChange={(v) => void changeRole(m.id, v)}
                  disabled={m.is_owner}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SEAT_ROLES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {m.accepted_at ? null : (
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={`Copy invite link for ${m.email}`}
                    onClick={() => void copyInvite(m.invite_token)}
                  >
                    <Copy className="h-4 w-4" />
                    Invite link
                  </Button>
                )}
                {m.is_owner ? null : (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${m.email}`}
                    onClick={() => void remove(m.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
