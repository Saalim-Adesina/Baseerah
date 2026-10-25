import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { BackLink } from "@/components/back-link";
import { BillingPanel } from "@/components/billing-panel";
import { GmailConnectionPanel } from "@/components/gmail-connection";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TABS = ["billing", "inbox"] as const;
type SettingsTab = (typeof TABS)[number];

type SettingsSearch = {
  /** Optional so that a bare <Link to="/settings" /> stays valid; defaults to billing. */
  tab?: SettingsTab;
  /** Appended by Polar when it sends a buyer back from checkout. */
  checkout_id?: string;
};

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Baseerah Screening" },
      {
        name: "description",
        content:
          "Manage your plan and seats, connect the mailbox your deals arrive in, and choose how many messages each scan reads.",
      },
      { property: "og:title", content: "Settings — Baseerah" },
      {
        property: "og:description",
        content: "Plan and billing, deal inbox connection and scan preferences.",
      },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): SettingsSearch => {
    const tab = search["tab"];
    const checkoutId = search["checkout_id"];
    return {
      ...(TABS.includes(tab as SettingsTab) ? { tab: tab as SettingsTab } : {}),
      ...(typeof checkoutId === "string" && checkoutId ? { checkout_id: checkoutId } : {}),
    };
  },
  component: SettingsPage,
});

function SettingsPage() {
  const search = useSearch({ from: "/_authenticated/settings" });
  const tab = search.tab ?? "billing";
  const navigate = useNavigate({ from: "/settings" });

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <BackLink />
      <p className="label-caps">Account</p>
      <h1 className="mt-1 text-4xl">Settings</h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        Manage your plan and seats, and connect the mailbox your deals arrive in.
      </p>

      <Tabs
        value={tab}
        onValueChange={(next) =>
          void navigate({ search: { tab: next as SettingsTab }, replace: true })
        }
        className="mt-8"
      >
        <TabsList>
          <TabsTrigger value="billing">Plan &amp; billing</TabsTrigger>
          <TabsTrigger value="inbox">Deal inbox</TabsTrigger>
        </TabsList>

        <TabsContent value="billing" className="mt-6">
          <BillingPanel />
        </TabsContent>

        <TabsContent value="inbox" className="mt-6 space-y-4">
          <GmailConnectionPanel />
        </TabsContent>
      </Tabs>
    </main>
  );
}
