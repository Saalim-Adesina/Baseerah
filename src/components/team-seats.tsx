import { useCallback, useEffect, useState } from "react";
import { Loader2, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
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
import { atSeatLimit, overageSeats, seatsUsed, totalSeats } from "@/lib/seats";

type Member = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  status: string;
  created_at: string;
};

const inviteSchema = z.object({
  email: z.string().trim().email("Enter a valid work email").max(255),
  full_name: z.string().trim().max(100).optional(),
  role: z.enum(["admin", "analyst", "viewer"]),
});

export function TeamSeats({ plan, seats }: { plan: Plan; seats: number }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<SeatRole>("analyst");

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("team_members")
      .select("id,email,full_name,role,status,created_at")
      .order("created_at", { ascending: true });
    if (error) toast.error(error.message);
    setMembers((data as Member[] | null) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const total = totalSeats(plan, seats);
  const used = seatsUsed(members.length);
  const atLimit = atSeatLimit(plan, members.length);
  const overage = overageSeats(plan, seats, members.length);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const parsed = inviteSchema.safeParse({ email, full_name: name || undefined, role });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid invite");
      return;
    }
    if (atLimit) {
      toast.error(`Your plan is capped at ${plan.maxSeats} seats.`);
      return;
    }
    setBusy(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setBusy(false);
      return;
    }
    const { error } = await supabase.from("team_members").insert({
      owner_id: auth.user.id,
      email: parsed.data.email.toLowerCase(),
      full_name: parsed.data.full_name ?? null,
      role: parsed.data.role,
      status: "invited",
    });
    setBusy(false);
    if (error) {
      toast.error(
        error.code === "23505" ? "That teammate already has a seat." : error.message,
      );
      return;
    }
    setEmail("");
    setName("");
    toast.success("Seat assigned — invite sent to their inbox.");
    void load();
  }

  async function changeRole(id: string, next: string) {
    const { error } = await supabase.from("team_members").update({ role: next }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setMembers((m) => m.map((x) => (x.id === id ? { ...x, role: next } : x)));
  }

  async function remove(id: string) {
    const { error } = await supabase.from("team_members").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setMembers((m) => m.filter((x) => x.id !== id));
    toast.success("Seat released.");
  }

  return (
    <section className="panel mt-8 px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="label-caps">Team seats</p>
          <h2 className="mt-1 text-2xl">
            {used} of {plan.maxSeats === null ? "unlimited" : total} seats used
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {plan.name} includes {plan.seatsIncluded} seats
            {plan.extraSeatPrice && plan.extraSeatPrice !== "Included"
              ? ` — extra seats are ${plan.extraSeatPrice}`
              : ""}
            . Each teammate gets their own login into the shared pipeline.
          </p>
        </div>
        {overage > 0 ? (
          <Badge variant="outline" className="border-primary text-primary">
            {overage} seat{overage > 1 ? "s" : ""} over — billed at renewal
          </Badge>
        ) : null}
      </div>

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
        <Button type="submit" disabled={busy || atLimit}>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <UserPlus className="h-4 w-4" />
          )}
          Assign seat
        </Button>
      </form>

      <div className="mt-6 divide-y divide-border/70 border-t border-border/70">
        <div className="flex items-center justify-between py-3">
          <div>
            <p className="text-sm">You (account owner)</p>
            <p className="text-xs text-muted-foreground">Billing, thesis and full pipeline access</p>
          </div>
          <Badge variant="secondary">Owner</Badge>
        </div>

        {loading ? (
          <p className="py-4 text-sm text-muted-foreground">Loading seats…</p>
        ) : members.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            No teammates yet — assign a seat to bring your analysts into the same deal flow.
          </p>
        ) : (
          members.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm">{m.full_name || m.email}</p>
                <p className="text-xs text-muted-foreground">
                  {m.email} · {m.status === "invited" ? "Invite pending" : "Active"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Select value={m.role} onValueChange={(v) => void changeRole(m.id, v)}>
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
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${m.email}`}
                  onClick={() => void remove(m.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-5 grid gap-2 md:grid-cols-3">
        {SEAT_ROLES.map((r) => (
          <p key={r.value} className="text-xs text-muted-foreground">
            <span className="text-foreground">{r.label}</span> — {r.blurb}
          </p>
        ))}
      </div>
    </section>
  );
}
