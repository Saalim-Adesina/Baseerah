import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { FileUp, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { BackLink } from "@/components/back-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { extractDealFields, extractDocument } from "@/lib/deal-ai.functions";
import { saveDeal, uid } from "@/lib/store";
import { ROUNDS, type Deal, type Founder, type Round } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { INTAKE_FIELDS, type IntakeFieldKey } from "@/lib/deal-intake-fields";

export const Route = createFileRoute("/_authenticated/deals/new")({
  head: () => ({
    meta: [
      { title: "Add a deal — Baseerah Investment Screening" },
      {
        name: "description",
        content:
          "Upload a pitch deck and founder context to run an automated, thesis-aligned screening of a new startup deal.",
      },
      { property: "og:title", content: "Add a deal — Baseerah" },
      {
        property: "og:description",
        content: "Upload a deck, add founder LinkedIn profiles and meeting notes, then screen.",
      },
    ],
  }),
  component: NewDeal,
});

const emptyFounder = (): Founder => ({
  id: uid(),
  name: "",
  role: "",
  linkedin: "",
  background: "",
});

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const FIELD = Object.fromEntries(INTAKE_FIELDS.map((f) => [f.key, f])) as Record<
  IntakeFieldKey,
  (typeof INTAKE_FIELDS)[number]
>;

function NewDeal() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    company: "",
    website: "",
    oneLiner: "",
    sector: "",
    geography: "",
    round: "" as Round | "",
    raising: "",
    valuation: "",
    traction: "",
    unitEconomics: "",
    competition: "",
    meetingNotes: "",
    personalBias: "",
  });
  const [founders, setFounders] = useState<Founder[]>([emptyFounder()]);
  const [deckText, setDeckText] = useState("");
  const [deckFileName, setDeckFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [reading, setReading] = useState(false);
  // Which inputs the deck filled. Drives the "From deck" badge, and is cleared
  // per field the moment the user types over it — an edited field is theirs.
  const [fromDeck, setFromDeck] = useState<Set<string>>(new Set());
  const [reviewed, setReviewed] = useState(false);

  const clearBadge = (key: string) =>
    setFromDeck((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });

  const set = (key: keyof typeof form, value: string) => {
    clearBadge(key);
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  /**
   * Reads the deck, then asks the model which fields it states outright. Only
   * non-empty answers are written, so a field the deck is silent about stays
   * blank for the user to fill or to stand as a declared gap.
   */
  const autofillFrom = async (text: string) => {
    setReading(true);
    try {
      const fields = await extractDealFields({ data: { deckText: text } });
      const filled = new Set<string>();

      setForm((prev) => {
        const next = { ...prev };
        // Driven off the same list the model was questioned from, so a field
        // added there lands here without a second edit.
        for (const { key } of INTAKE_FIELDS) {
          if (key === "round") continue;
          const value = fields[key];
          // Only ever fill a blank: never overwrite something already typed.
          if (typeof value === "string" && value.trim() && !prev[key]) {
            next[key] = value.trim();
            filled.add(key);
          }
        }
        // Round is a closed set, so it is checked against ROUNDS rather than
        // trusted as a string — an off-list stage stays unset.
        if (!prev.round && fields.round && ROUNDS.includes(fields.round)) {
          next.round = fields.round;
          filled.add("round");
        }
        return next;
      });

      const named = (fields.founders ?? []).filter(
        (f) => f.name?.trim() || f.linkedin?.trim() || f.background?.trim(),
      );
      if (named.length) {
        setFounders((prev) => {
          // Replace the blank starter row; keep anything already typed.
          const typed = prev.filter(
            (f) => f.name.trim() || f.linkedin.trim() || f.background.trim(),
          );
          return [
            ...typed,
            ...named.map((f) => ({
              id: uid(),
              name: f.name?.trim() ?? "",
              role: f.role?.trim() ?? "",
              linkedin: f.linkedin?.trim() ?? "",
              background: f.background?.trim() ?? "",
            })),
          ];
        });
        filled.add("founders");
      }

      setFromDeck(filled);
      setReviewed(false);
      toast.success(
        filled.size
          ? `Filled ${filled.size} field${filled.size === 1 ? "" : "s"} from the deck — review before saving`
          : "The deck did not state any of these fields plainly. Fill them in yourself.",
      );
    } catch (error) {
      console.error(error);
      // A failed read is not a failed upload: the deck text is still attached.
      toast.error(
        error instanceof Error
          ? `Could not read fields from the deck: ${error.message}`
          : "Could not read fields from the deck",
      );
    } finally {
      setReading(false);
    }
  };

  const handleFile = async (file?: File) => {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      toast.error("File is larger than 15MB");
      return;
    }
    setParsing(true);
    setDeckFileName(file.name);
    try {
      let text: string;
      if (/\.(txt|md|csv)$/i.test(file.name)) {
        text = await file.text();
      } else {
        const dataUrl = await fileToDataUrl(file);
        const result = await extractDocument({
          data: {
            filename: file.name,
            mimeType: file.type || "application/octet-stream",
            dataUrl,
          },
        });
        text = result.text;
      }
      setDeckText(text);
      setParsing(false);
      if (text.trim()) await autofillFrom(text);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Could not read that file");
      setDeckFileName("");
      setParsing(false);
    }
  };

  const submit = () => {
    if (!form.company.trim()) {
      toast.error("Company name is required");
      return;
    }
    const deal: Deal = {
      id: uid(),
      createdAt: Date.now(),
      ...form,
      round: form.round,
      founders: founders.filter((f) => f.name.trim() || f.linkedin.trim()),
      deckText,
      deckFileName,
      status: "new",
    };
    // The row id comes back from the database, so navigate with the saved deal
    // rather than the placeholder id built above.
    saveDeal(deal)
      .then((saved) => {
        toast.success(`${saved.company} added to pipeline`);
        return navigate({ to: "/deals/$dealId", params: { dealId: saved.id } });
      })
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : "Could not save this deal");
      });
  };

  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <BackLink />
      <p className="label-caps">Deck-first intake</p>
      <h1 className="mt-1 text-4xl">Add a deal</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Start with the deck. Everything it states plainly is filled in below for you to review;
        anything it does not is left blank, and a blank becomes an explicit diligence gap in the
        analysis rather than a guess.
      </p>

      <section className="panel mt-8 space-y-5 p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
            1
          </span>
          <h2 className="text-xl">Pitch deck</h2>
        </div>
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-surface/50 px-6 py-10 text-center transition-colors hover:border-primary/60">
          {parsing || reading ? (
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          ) : (
            <FileUp className="h-6 w-6 text-primary" />
          )}
          <span className="text-sm">
            {parsing
              ? "Extracting document…"
              : reading
                ? "Reading the deck, including its charts and images…"
                : deckFileName || "Upload pitch deck (PDF, PPTX, DOCX, images, TXT)"}
          </span>
          <span className="text-xs text-muted-foreground">
            {deckFileName && !parsing && !reading ? "Upload another to re-read" : "Max 15MB"}
          </span>
          <input
            type="file"
            className="hidden"
            accept=".pdf,.pptx,.ppt,.docx,.doc,.txt,.md,.csv,image/*"
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
        </label>
        {deckText ? (
          <details>
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              Extracted text ({deckText.length.toLocaleString()} characters)
            </summary>
            <Textarea
              rows={8}
              value={deckText}
              onChange={(event) => setDeckText(event.target.value)}
              className="mt-3 font-mono text-xs"
            />
          </details>
        ) : (
          <p className="text-center text-xs text-muted-foreground">
            No deck? Fill the details in by hand below.
          </p>
        )}
      </section>

      {fromDeck.size ? (
        <div className="panel mt-5 flex flex-wrap items-center justify-between gap-3 border-primary/40 px-6 py-4">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="max-w-2xl text-sm text-muted-foreground">
              <span className="text-foreground">
                {fromDeck.size} field{fromDeck.size === 1 ? "" : "s"} filled from the deck.
              </span>{" "}
              Check each against the source — a deck is the founders' claim, not a verified fact.
              Anything the deck did not state plainly is deliberately blank.
            </p>
          </div>
          <Button
            variant={reviewed ? "ghost" : "outline"}
            size="sm"
            onClick={() => setReviewed((prev) => !prev)}
          >
            {reviewed ? "Reviewed" : "Mark reviewed"}
          </Button>
        </div>
      ) : null}

      <section className="panel mt-5 space-y-5 p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
            2
          </span>
          <h2 className="text-xl">Company</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={FIELD.company.label} filled={fromDeck.has("company")}>
            <Input value={form.company} onChange={(e) => set("company", e.target.value)} />
          </Field>
          <Field label={FIELD.website.label} filled={fromDeck.has("website")}>
            <Input value={form.website} onChange={(e) => set("website", e.target.value)} />
          </Field>
        </div>
        <Field label={FIELD.oneLiner.label} filled={fromDeck.has("oneLiner")}>
          <Input value={form.oneLiner} onChange={(e) => set("oneLiner", e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={FIELD.sector.label} filled={fromDeck.has("sector")}>
            <Input value={form.sector} onChange={(e) => set("sector", e.target.value)} />
          </Field>
          <Field label={FIELD.geography.label} filled={fromDeck.has("geography")}>
            <Input value={form.geography} onChange={(e) => set("geography", e.target.value)} />
          </Field>
          <Field label={FIELD.round.label} filled={fromDeck.has("round")}>
            <Select value={form.round} onValueChange={(value) => set("round", value as Round)}>
              <SelectTrigger>
                <SelectValue placeholder="Not stated" />
              </SelectTrigger>
              <SelectContent>
                {ROUNDS.map((round) => (
                  <SelectItem key={round} value={round}>
                    {round}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={FIELD.raising.label} filled={fromDeck.has("raising")}>
            <Input
              placeholder={FIELD.raising.placeholder}
              value={form.raising}
              onChange={(e) => set("raising", e.target.value)}
            />
          </Field>
          <Field label={FIELD.valuation.label} filled={fromDeck.has("valuation")}>
            <Input
              placeholder={FIELD.valuation.placeholder}
              value={form.valuation}
              onChange={(e) => set("valuation", e.target.value)}
            />
          </Field>
        </div>
      </section>

      <section className="panel mt-5 space-y-4 p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                3
              </span>
              <h2 className="text-xl">Founders</h2>
              {fromDeck.has("founders") ? (
                <Badge
                  variant="outline"
                  className="gap-1 px-1.5 py-0 text-[9px] font-normal uppercase"
                >
                  <Sparkles className="h-2.5 w-2.5" />
                  From deck
                </Badge>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Weighted highest. LinkedIn history beats deck claims.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFounders((prev) => [...prev, emptyFounder()])}
          >
            <Plus className="mr-1 h-4 w-4" /> Founder
          </Button>
        </div>
        {founders.map((founder, index) => (
          <div key={founder.id} className="rounded-lg border border-border bg-surface/50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="label-caps">Founder {index + 1}</span>
              {founders.length > 1 ? (
                <button
                  type="button"
                  aria-label="Remove founder"
                  onClick={() =>
                    setFounders((prev) => prev.filter((item) => item.id !== founder.id))
                  }
                  className="text-muted-foreground transition-colors hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                placeholder="Name"
                value={founder.name}
                onChange={(e) =>
                  setFounders((prev) =>
                    prev.map((item) =>
                      item.id === founder.id ? { ...item, name: e.target.value } : item,
                    ),
                  )
                }
              />
              <Input
                placeholder="Role (CEO, CTO…)"
                value={founder.role}
                onChange={(e) =>
                  setFounders((prev) =>
                    prev.map((item) =>
                      item.id === founder.id ? { ...item, role: e.target.value } : item,
                    ),
                  )
                }
              />
            </div>
            <Input
              className="mt-3"
              placeholder="LinkedIn URL"
              value={founder.linkedin}
              onChange={(e) =>
                setFounders((prev) =>
                  prev.map((item) =>
                    item.id === founder.id ? { ...item, linkedin: e.target.value } : item,
                  ),
                )
              }
            />
            <Textarea
              className="mt-3"
              rows={3}
              placeholder="Background: prior roles, domain experience, why this founder for this problem, references…"
              value={founder.background}
              onChange={(e) =>
                setFounders((prev) =>
                  prev.map((item) =>
                    item.id === founder.id ? { ...item, background: e.target.value } : item,
                  ),
                )
              }
            />
          </div>
        ))}
      </section>

      <section className="panel mt-5 space-y-5 p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
            4
          </span>
          <h2 className="text-xl">Context & evidence</h2>
        </div>
        <p className="-mt-2 text-sm text-muted-foreground">
          Meeting notes and your own read are yours alone — the deck cannot supply them.
        </p>
        <Field label={FIELD.traction.label} filled={fromDeck.has("traction")}>
          <Textarea
            rows={3}
            placeholder={FIELD.traction.placeholder}
            value={form.traction}
            onChange={(e) => set("traction", e.target.value)}
          />
        </Field>
        <Field label={FIELD.unitEconomics.label} filled={fromDeck.has("unitEconomics")}>
          <Textarea
            rows={3}
            placeholder={FIELD.unitEconomics.placeholder}
            value={form.unitEconomics}
            onChange={(e) => set("unitEconomics", e.target.value)}
          />
        </Field>
        <Field label={FIELD.competition.label} filled={fromDeck.has("competition")}>
          <Textarea
            rows={3}
            value={form.competition}
            onChange={(e) => set("competition", e.target.value)}
          />
        </Field>
        <Field label="Meeting notes">
          <Textarea
            rows={5}
            placeholder="What the founders actually said, how they handled hard questions, energy, clarity, honesty…"
            value={form.meetingNotes}
            onChange={(e) => set("meetingNotes", e.target.value)}
          />
        </Field>
        <Field label="Your personal biases / gut read">
          <Textarea
            rows={3}
            placeholder="Say it plainly — the screener will surface where this bias may be distorting the read."
            value={form.personalBias}
            onChange={(e) => set("personalBias", e.target.value)}
          />
        </Field>
      </section>

      <div className="mt-6 flex justify-end gap-3">
        <Button variant="ghost" onClick={() => navigate({ to: "/pipeline" })}>
          Cancel
        </Button>
        <Button size="lg" onClick={submit} disabled={parsing || reading}>
          Save deal
        </Button>
      </div>
    </main>
  );
}

function Field({
  label,
  children,
  filled = false,
}: {
  label: string;
  children: React.ReactNode;
  filled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Label className="label-caps">{label}</Label>
        {filled ? (
          <Badge variant="outline" className="gap-1 px-1.5 py-0 text-[9px] font-normal uppercase">
            <Sparkles className="h-2.5 w-2.5" />
            From deck
          </Badge>
        ) : null}
      </div>
      {children}
    </div>
  );
}
