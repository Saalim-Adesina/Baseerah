import { createFileRoute } from "@tanstack/react-router";
import { BackLink } from "@/components/back-link";
import { GmailConnectionPanel } from "@/components/gmail-connection";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Baseerah Screening" },
      {
        name: "description",
        content:
          "Connect the mailbox your deals arrive in and choose how many messages each scan reads.",
      },
      { property: "og:title", content: "Settings — Baseerah" },
      {
        property: "og:description",
        content: "Deal inbox connection and scan preferences.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <BackLink />
      <p className="label-caps">Account</p>
      <h1 className="mt-1 text-4xl">Settings</h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        Connect the mailbox your deals arrive in, and choose how deeply each scan reads it.
      </p>

      <section className="mt-8 space-y-4">
        <GmailConnectionPanel />
      </section>
    </main>
  );
}
