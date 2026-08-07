import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Copy, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSession, INVESTOR_TYPES, type InvestorType } from "@/lib/account";
import { inboxAddress } from "@/lib/account";

import {
  CHECK_SIZE_OPTIONS,
  DEALS_PER_MONTH_OPTIONS,
  EMPTY_ANSWERS,
  HEARD_FROM_OPTIONS,
  HOURS_PER_MONTH_OPTIONS,
  INDUSTRY_OPTIONS,
  REVIEW_METHOD_OPTIONS,
  TOOL_OPTIONS,
  labelFor,
  toolLogoUrl,
  type OnboardingAnswers,
} from "@/lib/onboarding";
import { getMyOnboarding, saveMyOnboarding } from "@/lib/onboarding.functions";
import { getThesis, saveThesis } from "@/lib/store";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [
      { title: "Set up your screening desk — Baseerah" },
      {
        name: "description",
        content:
          "Answer a few questions about your deal flow so Baseerah can tune scoring, industries and your private deal inbox.",
      },
      { property: "og:title", content: "Set up your screening desk — Baseerah" },
      {
        property: "og:description",
        content: "A short guided setup that tunes your screening engine to your thesis.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OnboardingPage,
});

type StepId =
  | "name"
  | "investor"
  | "volume"
  | "method"
  | "hours"
  | "tools"
  | "industries"
  | "thesis"
  | "check"
  | "heard"
  | "inbox"
  | "confirm";

const STEPS: { id: StepId; title: string; blurb: string }[] = [
  {
    id: "name",
    title: "What's your name?",
    blurb: "This is how memos and pass emails will sign off.",
  },
  {
    id: "investor",
    title: "How do you invest?",
    blurb: "Sets the shape of your workspace — solo desk or a team with seats.",
  },
  {
    id: "volume",
    title: "How many deals do you review each month?",
    blurb: "This sets how aggressively Baseerah filters your inbox.",
  },
  {
    id: "method",
    title: "How do you review deals today?",
    blurb: "So we know what Baseerah is replacing.",
  },
  {
    id: "hours",
    title: "How long do you spend reviewing each month?",
    blurb: "We use this to show you what screening gives back.",
  },
  {
    id: "tools",
    title: "Which tools do you already use?",
    blurb: "Pick everything that touches your deal flow.",
  },
  {
    id: "industries",
    title: "Which industries do you invest in?",
    blurb: "These become your preferred industries in the thesis.",
  },
  {
    id: "thesis",
    title: "Describe your thesis in a sentence or two.",
    blurb: "Plain language. Every score, memo and pass email is written against this.",
  },
  {
    id: "check",
    title: "What's your typical cheque size?",
    blurb: "Calibrates round-stage expectations.",
  },
  {
    id: "heard",
    title: "How did you hear about Baseerah?",
    blurb: "Genuinely useful for us — one click and you're done.",
  },
  {
    id: "inbox",
    title: "Connect your deal inbox",
    blurb: "Forward inbound decks here and they land in your pipeline, screened.",
  },
  {
    id: "confirm",
    title: "Confirm your email",
    blurb: "One last thing — verify the address your deals and memos are tied to.",
  },
];

function OnboardingPage() {
  const navigate = useNavigate();
  const { user } = useSession();
  const load = useServerFn(getMyOnboarding);
  const save = useServerFn(saveMyOnboarding);

  const [answers, setAnswers] = useState<OnboardingAnswers>(EMPTY_ANSWERS);
  const [fullName, setFullName] = useState("");
  const [firmName, setFirmName] = useState("");
  const [investorType, setInvestorType] = useState<InvestorType>("angel");
  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const emailConfirmed = Boolean(
    (user as { email_confirmed_at?: string | null } | null)?.email_confirmed_at,
  );

  /** The link lands the user in the app, not back on the sign-in page. */
  async function sendConfirmation() {
    if (!user?.email) return;
    setSending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: user.email,
        options: { emailRedirectTo: `${window.location.origin}/pipeline` },
      });
      if (error) throw error;
      setSent(true);
      toast.success("Confirmation email sent.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send the email.");
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    let active = true;
    void load()
      .then((state) => {
        if (!active) return;
        if (state.answers) setAnswers({ ...EMPTY_ANSWERS, ...state.answers });
        setFullName(state.profile.full_name ?? "");
        setFirmName(state.profile.firm_name ?? "");
        setInvestorType(state.profile.investor_type);
        setReady(true);
      })
      .catch(() => setReady(true));
    return () => {
      active = false;
    };
  }, [load]);

  const step = STEPS[index]!;
  const progress = Math.round(((index + 1) / STEPS.length) * 100);

  const set = <K extends keyof OnboardingAnswers>(key: K, value: OnboardingAnswers[K]) =>
    setAnswers((prev) => ({ ...prev, [key]: value }));

  const toggleIn = (key: "tools" | "industries", value: string) =>
    setAnswers((prev) => {
      const current = prev[key];
      return {
        ...prev,
        [key]: current.includes(value)
          ? current.filter((item) => item !== value)
          : [...current, value],
      };
    });

  /** Onboarding answers are settings: they write straight into the thesis. */
  function applyToSettings(final: OnboardingAnswers) {
    const thesis = getThesis();
    const industries = [...final.industries, final.industries_other ?? ""]
      .filter(Boolean)
      .join(", ");
    saveThesis({
      ...thesis,
      ...(final.thesis_sentence ? { statement: final.thesis_sentence } : {}),
      ...(industries ? { preferredIndustries: industries } : {}),
      ...(final.check_size ? { checkSize: labelFor(CHECK_SIZE_OPTIONS, final.check_size) } : {}),
    });
  }

  async function persist(complete: boolean) {
    setBusy(true);
    try {
      await save({
        data: {
          answers,
          profile: { full_name: fullName, firm_name: firmName, investor_type: investorType },
          complete,
        },
      });
      if (complete) {
        applyToSettings(answers);
        toast.success("Your screening desk is ready.");
        navigate({ to: "/pipeline" });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save your answers.");
    } finally {
      setBusy(false);
    }
  }

  async function next() {
    if (index === STEPS.length - 1) {
      await persist(true);
      return;
    }
    void persist(false);
    setIndex((value) => value + 1);
  }

  const forwarding = useMemo(() => (user ? inboxAddress(user.id) : ""), [user]);

  if (!ready) return null;

  return (
    <main className="mx-auto max-w-2xl px-5 py-16">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="label-caps">
          Step {index + 1} of {STEPS.length}
        </span>
        <span>{progress}%</span>
      </div>
      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-accent transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      <section className="mt-12">
        <h1 className="text-3xl leading-snug sm:text-4xl">{step.title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{step.blurb}</p>

        <div className="mt-9">
          {step.id === "name" ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="fullName" className="label-caps">
                  Your name
                </label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jane Okafor"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="firmName" className="label-caps">
                  Fund / entity name (optional)
                </label>
                <Input
                  id="firmName"
                  value={firmName}
                  onChange={(e) => setFirmName(e.target.value)}
                  placeholder="Okafor Angel Capital"
                />
              </div>
            </div>
          ) : null}

          {step.id === "investor" ? (
            <div className="grid gap-2.5">
              {INVESTOR_TYPES.map((option) => {
                const active = investorType === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setInvestorType(option.value)}
                    className={`cursor-pointer rounded-lg border px-4 py-3.5 text-left transition-colors ${
                      active ? "border-accent bg-accent/10" : "border-border hover:bg-secondary"
                    }`}
                  >
                    <span className="text-sm font-medium">{option.label}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {option.blurb}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {step.id === "volume" ? (
            <ChoiceList
              options={DEALS_PER_MONTH_OPTIONS}
              value={answers.deals_per_month}
              onSelect={(value) => set("deals_per_month", value)}
            />
          ) : null}

          {step.id === "method" ? (
            <ChoiceList
              options={REVIEW_METHOD_OPTIONS}
              value={answers.review_method}
              onSelect={(value) => set("review_method", value)}
            />
          ) : null}

          {step.id === "hours" ? (
            <ChoiceList
              options={HOURS_PER_MONTH_OPTIONS}
              value={answers.hours_per_month}
              onSelect={(value) => set("hours_per_month", value)}
            />
          ) : null}

          {step.id === "tools" ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {TOOL_OPTIONS.map((tool) => {
                const active = answers.tools.includes(tool.value);
                return (
                  <button
                    key={tool.value}
                    type="button"
                    onClick={() => toggleIn("tools", tool.value)}
                    className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-3 text-left text-sm transition-colors ${
                      active ? "border-accent bg-accent/10" : "border-border hover:bg-secondary"
                    }`}
                  >
                    {tool.domain ? (
                      <img
                        src={toolLogoUrl(tool.domain)}
                        alt={`${tool.label} logo`}
                        loading="lazy"
                        className="h-6 w-6 rounded"
                      />
                    ) : (
                      <span className="flex h-6 w-6 items-center justify-center rounded bg-muted text-[10px]">
                        —
                      </span>
                    )}
                    {tool.label}
                  </button>
                );
              })}
            </div>
          ) : null}

          {step.id === "industries" ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {INDUSTRY_OPTIONS.map((industry) => {
                  const active = answers.industries.includes(industry);
                  return (
                    <button
                      key={industry}
                      type="button"
                      onClick={() => toggleIn("industries", industry)}
                      className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                        active ? "border-accent bg-accent/10" : "border-border hover:bg-secondary"
                      }`}
                    >
                      {industry}
                    </button>
                  );
                })}
              </div>
              <Input
                placeholder="Anything else? e.g. space, defence, agritech"
                value={answers.industries_other ?? ""}
                onChange={(e) => set("industries_other", e.target.value)}
              />
            </div>
          ) : null}

          {step.id === "thesis" ? (
            <Textarea
              rows={5}
              placeholder="We back technical founders solving unglamorous problems in financial infrastructure…"
              value={answers.thesis_sentence ?? ""}
              onChange={(e) => set("thesis_sentence", e.target.value)}
            />
          ) : null}

          {step.id === "check" ? (
            <ChoiceList
              options={CHECK_SIZE_OPTIONS}
              value={answers.check_size}
              onSelect={(value) => set("check_size", value)}
            />
          ) : null}

          {step.id === "heard" ? (
            <div className="space-y-4">
              <ChoiceList
                options={HEARD_FROM_OPTIONS}
                value={answers.heard_from}
                onSelect={(value) => set("heard_from", value)}
              />
              <Input
                placeholder="Who or where, if you'd like to say"
                value={answers.heard_from_detail ?? ""}
                onChange={(e) => set("heard_from_detail", e.target.value)}
              />
            </div>
          ) : null}

          {step.id === "inbox" ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-surface p-5">
                <p className="label-caps">Your private forwarding address</p>
                <div className="mt-2 flex items-center gap-3">
                  <code className="flex-1 truncate font-mono text-sm">{forwarding}</code>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void navigator.clipboard.writeText(forwarding);
                      toast.success("Address copied");
                    }}
                  >
                    <Copy className="mr-1 h-3.5 w-3.5" /> Copy
                  </Button>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Add this as a forwarding rule in Gmail or Outlook for anything that looks like a
                  deck. Everything forwarded here is screened against your thesis automatically.
                </p>
              </div>
              <button
                type="button"
                onClick={() => set("connect_inbox", !answers.connect_inbox)}
                className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                  answers.connect_inbox
                    ? "border-accent bg-accent/10"
                    : "border-border hover:bg-secondary"
                }`}
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded border ${
                    answers.connect_inbox ? "border-accent bg-accent" : "border-border"
                  }`}
                >
                  {answers.connect_inbox ? (
                    <Check className="h-3.5 w-3.5 text-accent-foreground" />
                  ) : null}
                </span>
                I've set up forwarding to this address
              </button>
            </div>
          ) : null}

          {step.id === "confirm" ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-surface p-5">
                <p className="label-caps">Account email</p>
                <p className="mt-2 font-mono text-sm">{user?.email}</p>
                {emailConfirmed ? (
                  <p className="mt-3 flex items-center gap-2 text-sm text-accent-foreground">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent">
                      <Check className="h-3.5 w-3.5 text-accent-foreground" />
                    </span>
                    This address is confirmed.
                  </p>
                ) : (
                  <>
                    <p className="mt-3 text-xs text-muted-foreground">
                      We'll send a confirmation link. Opening it brings you straight into your
                      pipeline — no need to sign in again.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      disabled={sending}
                      onClick={() => void sendConfirmation()}
                    >
                      <MailCheck className="mr-1.5 h-3.5 w-3.5" />
                      {sent ? "Resend confirmation email" : "Send confirmation email"}
                    </Button>
                    {sent ? (
                      <p className="mt-3 text-xs text-muted-foreground">
                        Sent — check your inbox. You can finish setup now and confirm later.
                      </p>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          ) : null}
        </div>


        <div className="mt-12 flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => setIndex((value) => Math.max(0, value - 1))}
            className="flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:invisible"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void next()}
              className="cursor-pointer text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Skip
            </button>
            <Button onClick={() => void next()} disabled={busy}>
              {index === STEPS.length - 1 ? "Finish setup" : "Continue"}
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}

function ChoiceList({
  options,
  value,
  onSelect,
}: {
  options: readonly { value: string; label: string; blurb?: string }[];
  value: string | null;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="grid gap-2.5">
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onSelect(option.value)}
            className={`cursor-pointer rounded-lg border px-4 py-3.5 text-left transition-colors ${
              active ? "border-accent bg-accent/10" : "border-border hover:bg-secondary"
            }`}
          >
            <span className="text-sm font-medium">{option.label}</span>
            {option.blurb ? (
              <span className="mt-0.5 block text-xs text-muted-foreground">{option.blurb}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
