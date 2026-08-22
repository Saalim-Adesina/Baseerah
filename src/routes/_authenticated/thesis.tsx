import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { BackLink } from "@/components/back-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { getThesis, saveThesis, useHydrated, useStoreValue } from "@/lib/store";
import { DEFAULT_THESIS, METRIC_KEYS, type Thesis } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/thesis")({
  head: () => ({
    meta: [
      { title: "Investment thesis — Baseerah Screening" },
      {
        name: "description",
        content:
          "Describe your investment thesis, preferred industries and scoring weights in natural language, and customise how the screening model thinks.",
      },
      { property: "og:title", content: "Investment thesis — Baseerah" },
      {
        property: "og:description",
        content: "Natural-language thesis, industry preferences and metric weighting.",
      },
    ],
  }),
  component: ThesisPage,
});

function ThesisPage() {
  const hydrated = useHydrated();
  const selector = useCallback(() => getThesis(), []);
  const stored = useStoreValue(selector);
  const [draft, setDraft] = useState<Thesis>(stored);

  useEffect(() => setDraft(stored), [stored]);

  if (!hydrated) return null;

  const set = <K extends keyof Thesis>(key: K, value: Thesis[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <BackLink />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-caps">Screening engine</p>
          <h1 className="mt-1 text-4xl">Investment thesis</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Write it the way you'd explain it to a new associate. Every screening, memo and pass
            email is generated against exactly this.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setDraft(DEFAULT_THESIS)}>
            <RotateCcw className="mr-1 h-4 w-4" /> Reset
          </Button>
          <Button
            onClick={() => {
              void saveThesis(draft)
                .then(() => toast.success("Thesis saved"))
                .catch((error: unknown) =>
                  toast.error(error instanceof Error ? error.message : "Could not save the thesis"),
                );
            }}
          >
            <Save className="mr-1 h-4 w-4" /> Save
          </Button>
        </div>
      </div>

      <section className="panel mt-8 space-y-5 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Fund name">
            <Input value={draft.fundName} onChange={(e) => set("fundName", e.target.value)} />
          </Field>
          <Field label="Memo author">
            <Input
              value={draft.partnerName}
              onChange={(e) => set("partnerName", e.target.value)}
            />
          </Field>
        </div>
        <Field label="Thesis statement">
          <Textarea
            rows={5}
            value={draft.statement}
            onChange={(e) => set("statement", e.target.value)}
          />
        </Field>
        <Field label="Preferred industries">
          <Textarea
            rows={3}
            value={draft.preferredIndustries}
            onChange={(e) => set("preferredIndustries", e.target.value)}
          />
        </Field>
        <Field label="Exclusions / anti-portfolio">
          <Textarea
            rows={3}
            value={draft.antiPortfolio}
            onChange={(e) => set("antiPortfolio", e.target.value)}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Stage focus">
            <Input value={draft.stageFocus} onChange={(e) => set("stageFocus", e.target.value)} />
          </Field>
          <Field label="Check size">
            <Input value={draft.checkSize} onChange={(e) => set("checkSize", e.target.value)} />
          </Field>
        </div>
      </section>

      <section className="panel mt-5 space-y-5 p-6">
        <div>
          <h2 className="text-2xl">Model thinking</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Instructions the screener follows literally on every deal.
          </p>
        </div>
        <Textarea
          rows={5}
          value={draft.modelInstructions}
          onChange={(e) => set("modelInstructions", e.target.value)}
        />
        <div>
          <div className="flex items-center justify-between">
            <Label className="label-caps">
              Creativity vs. rigour ({draft.temperature.toFixed(2)})
            </Label>
            <span className="text-xs text-muted-foreground">
              {draft.temperature < 0.3
                ? "Conservative, literal"
                : draft.temperature < 0.6
                  ? "Balanced"
                  : "Exploratory"}
            </span>
          </div>
          <Slider
            className="mt-3"
            min={0}
            max={1}
            step={0.05}
            value={[draft.temperature]}
            onValueChange={([value]) => set("temperature", value ?? 0.35)}
          />
        </div>
      </section>

      <section className="panel mt-5 space-y-4 p-6">
        <div>
          <h2 className="text-2xl">Scoring weights</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The people-first metrics ship weighted highest — change them if your fund reads deals
            differently.
          </p>
        </div>
        {METRIC_KEYS.map((metric) => (
          <div key={metric.key} className="flex items-center gap-4">
            <span className="w-56 shrink-0 text-sm">{metric.label}</span>
            <Slider
              min={0}
              max={1}
              step={0.05}
              value={[draft.weights[metric.key] ?? 0.5]}
              onValueChange={([value]) =>
                set("weights", { ...draft.weights, [metric.key]: value ?? 0.5 })
              }
            />
            <span className="w-10 shrink-0 text-right font-mono text-sm text-muted-foreground">
              {(draft.weights[metric.key] ?? 0.5).toFixed(2)}
            </span>
          </div>
        ))}
      </section>
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
