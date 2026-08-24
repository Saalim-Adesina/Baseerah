import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Inbox, Mail, ScanLine, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLANS } from "@/lib/plans";
import { INVESTOR_TYPES } from "@/lib/account";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Baseerah — Deal Screening for Angel Investors" },
      {
        name: "description",
        content:
          "Angels get more decks than any fund and have the least time. Connect your inbox to Baseerah and get every deal scored against your own thesis, people first.",
      },
      { property: "og:title", content: "Baseerah — Deal Screening for Angel Investors" },
      {
        property: "og:description",
        content:
          "Connect your deal inbox and wake up to a ranked shortlist, scored against your angel thesis.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <main>
      <section className="mx-auto max-w-5xl px-5 pb-14 pt-20 text-center">
        <p className="label-caps">Built for angel investors</p>
        <h1 className="mx-auto mt-3 max-w-3xl text-5xl leading-[1.05] md:text-6xl">
          Screen your deal inbox instead of drowning in it.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground">
          You see hundreds of decks a month, from warm intros, demo days and total strangers — with
          no analyst and no time. Connect the mailbox they land in and every deal comes back scored
          against your own thesis, judged on the founders first.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/auth" search={{ mode: "signup" }}>
              Create your angel account
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/auth" search={{ mode: "signin" }}>
              Sign in
            </Link>
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          14-day trial · card only needed when you subscribe
        </p>
      </section>

      <section className="mx-auto grid max-w-6xl gap-3 px-5 pb-16 md:grid-cols-4">
        {[
          {
            icon: Inbox,
            title: "Connect your inbox",
            body: "Read-only access to your mailbox. Baseerah finds the decks and scores them.",
          },
          {
            icon: ScanLine,
            title: "Filtered at volume",
            body: "Hundreds of deals a month triaged into shortlist, track and pass.",
          },
          {
            icon: ShieldCheck,
            title: "People first",
            body: "LinkedIn, meeting notes and your own biases weighted above deck claims.",
          },
          {
            icon: Mail,
            title: "Graceful passes",
            body: "A written, on-brand pass email for every deal you decline.",
          },
        ].map((item) => (
          <div key={item.title} className="panel px-5 py-5 text-left">
            <item.icon className="h-5 w-5 text-primary" />
            <h2 className="mt-3 text-lg">{item.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
          </div>
        ))}
      </section>

      <section className="border-y border-border/70 bg-secondary/30 py-16">
        <div className="mx-auto max-w-6xl px-5">
          <p className="label-caps">Pricing</p>
          <h2 className="mt-1 text-4xl">Angel-first pricing</h2>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Start on the Angel plan — it is the one built for a solo cheque writer screening their
            own inbox. Syndicates, incubators, venture funds and family offices can scale up when
            they need the volume.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {PLANS.map((plan) => (
              <div
                key={plan.id}
                className={`panel flex flex-col px-6 py-6 ${
                  plan.highlight ? "border-primary shadow-lg ring-1 ring-primary/40" : ""
                }`}
              >
                {plan.highlight ? (
                  <span className="mb-3 w-fit rounded bg-primary px-2 py-0.5 text-[10px] uppercase tracking-wider text-primary-foreground">
                    Most popular for angels
                  </span>
                ) : null}
                <h3 className="text-2xl">{plan.name}</h3>
                <p className="text-xs text-muted-foreground">{plan.audience}</p>
                <p className="mt-4 font-display text-4xl">
                  {plan.price}
                  <span className="ml-1 font-sans text-xs text-muted-foreground">
                    {plan.cadence}
                  </span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {plan.maxSeats === 1
                    ? "Single seat"
                    : plan.maxSeats === null
                      ? `${plan.seatsIncluded} seats included · unlimited`
                      : `${plan.seatsIncluded} seats included · up to ${plan.maxSeats}`}
                </p>
                <ul className="mt-5 flex-1 space-y-2 text-sm">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button asChild className="mt-6" variant={plan.highlight ? "default" : "outline"}>
                  <Link to="/auth" search={{ mode: "signup" }}>
                    {plan.id === "institution" ? "Talk to us" : `Start with ${plan.name}`}
                  </Link>
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16">
        <p className="label-caps">Who screens with Baseerah</p>
        <h2 className="mt-1 text-3xl">Angels first — everyone else welcome</h2>
        <div className="mt-6 grid gap-3 md:grid-cols-5">
          {INVESTOR_TYPES.map((type) => (
            <div
              key={type.value}
              className={`panel px-4 py-4 ${type.value === "angel" ? "border-primary" : ""}`}
            >
              <h3 className="text-base">{type.label}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{type.blurb}</p>
            </div>
          ))}
        </div>
        <div className="panel mt-10 flex flex-wrap items-center justify-between gap-4 px-6 py-6">
          <div>
            <h2 className="text-2xl">Ready to filter your deal flow?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Create an account, set your thesis in plain English, connect your inbox.
            </p>
          </div>
          <Button asChild size="lg">
            <Link to="/auth" search={{ mode: "signup" }}>
              Create your account
            </Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
