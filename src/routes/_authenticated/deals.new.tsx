import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { FileUp, Loader2, Plus, Trash2 } from "lucide-react";
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
import { extractDocument } from "@/lib/deal-ai.functions";
import { saveDeal, uid } from "@/lib/store";
import { ROUNDS, type Deal, type Founder, type Round } from "@/lib/types";

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

function NewDeal() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    company: "",
    website: "",
    oneLiner: "",
    sector: "",
    geography: "",
    round: "Seed" as Round,
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

  const set = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleFile = async (file?: File) => {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      toast.error("File is larger than 15MB");
      return;
    }
    setParsing(true);
    setDeckFileName(file.name);
    try {
      if (/\.(txt|md|csv)$/i.test(file.name)) {
        setDeckText(await file.text());
      } else {
        const dataUrl = await fileToDataUrl(file);
        const result = await extractDocument({
          data: {
            filename: file.name,
            mimeType: file.type || "application/octet-stream",
            dataUrl,
          },
        });
        setDeckText(result.text);
      }
      toast.success("Document extracted");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Could not read that file");
      setDeckFileName("");
    } finally {
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
      <p className="label-caps">Manual intake</p>
      <h1 className="mt-1 text-4xl">Add a deal</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Anything you leave blank becomes an explicit diligence gap in the analysis rather than a
        guess.
      </p>

      <section className="panel mt-8 space-y-5 p-6">
        <h2 className="text-xl">Company</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company name *">
            <Input value={form.company} onChange={(e) => set("company", e.target.value)} />
          </Field>
          <Field label="Website">
            <Input value={form.website} onChange={(e) => set("website", e.target.value)} />
          </Field>
        </div>
        <Field label="One liner">
          <Input value={form.oneLiner} onChange={(e) => set("oneLiner", e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Sector / industry">
            <Input value={form.sector} onChange={(e) => set("sector", e.target.value)} />
          </Field>
          <Field label="Geography">
            <Input value={form.geography} onChange={(e) => set("geography", e.target.value)} />
          </Field>
          <Field label="Round">
            <Select value={form.round} onValueChange={(value) => set("round", value as Round)}>
              <SelectTrigger>
                <SelectValue />
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
          <Field label="Raising">
            <Input
              placeholder="$2.5m"
              value={form.raising}
              onChange={(e) => set("raising", e.target.value)}
            />
          </Field>
          <Field label="Valuation / terms">
            <Input
              placeholder="$12m post, SAFE"
              value={form.valuation}
              onChange={(e) => set("valuation", e.target.value)}
            />
          </Field>
        </div>
      </section>

      <section className="panel mt-5 space-y-4 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl">Founders</h2>
            <p className="text-sm text-muted-foreground">
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
        <h2 className="text-xl">Deck & documents</h2>
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-surface/50 px-6 py-10 text-center transition-colors hover:border-primary/60">
          {parsing ? (
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          ) : (
            <FileUp className="h-6 w-6 text-primary" />
          )}
          <span className="text-sm">
            {parsing
              ? "Extracting document…"
              : deckFileName || "Upload pitch deck (PDF, PPTX, DOCX, images, TXT)"}
          </span>
          <span className="text-xs text-muted-foreground">Max 15MB</span>
          <input
            type="file"
            className="hidden"
            accept=".pdf,.pptx,.ppt,.docx,.doc,.txt,.md,.csv,image/*"
            onChange={(event) => handleFile(event.target.files?.[0])}
          />
        </label>
        {deckText ? (
          <Textarea
            rows={8}
            value={deckText}
            onChange={(event) => setDeckText(event.target.value)}
            className="font-mono text-xs"
          />
        ) : null}
      </section>

      <section className="panel mt-5 space-y-5 p-6">
        <h2 className="text-xl">Context & evidence</h2>
        <Field label="Traction / metrics">
          <Textarea
            rows={3}
            placeholder="ARR, growth rate, users, pipeline, retention, logos…"
            value={form.traction}
            onChange={(e) => set("traction", e.target.value)}
          />
        </Field>
        <Field label="Unit economics">
          <Textarea
            rows={3}
            placeholder="CAC, LTV, gross margin, payback, burn multiple, contribution margin…"
            value={form.unitEconomics}
            onChange={(e) => set("unitEconomics", e.target.value)}
          />
        </Field>
        <Field label="Known competitors">
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
        <Button size="lg" onClick={submit} disabled={parsing}>
          Save deal
        </Button>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="label-caps">{label}</Label>
      {children}
    </div>
  );
}
