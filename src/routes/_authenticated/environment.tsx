import { useEffect, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Check, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { BackLink } from "@/components/back-link";
import { getEnvDiagnostics, type EnvDiagnostics } from "@/lib/env-diagnostics.functions";

export const Route = createFileRoute("/_authenticated/environment")({
  // The real gate is server-side (getEnvDiagnostics). This is the UX half, so a
  // non-developer is redirected instead of watching the call fail.
  beforeLoad: async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw redirect({ to: "/auth", search: { mode: "signin" } });
    const { data, error } = await supabase.rpc("has_role", {
      _user_id: auth.user.id,
      _role: "developer",
    });
    if (error || !data) throw redirect({ to: "/pipeline" });
  },
  head: () => ({
    meta: [{ title: "Developer · Environment" }],
  }),
  component: EnvironmentPage,
});

function Yes() {
  return <Check className="h-4 w-4 text-primary" aria-label="yes" />;
}

function No() {
  return <X className="h-4 w-4 text-destructive" aria-label="no" />;
}

function EnvironmentPage() {
  const load = useServerFn(getEnvDiagnostics);
  const [data, setData] = useState<EnvDiagnostics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load({} as never)
      .then((d) => setData(d as EnvDiagnostics))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load."));
  }, [load]);

  if (error) {
    return (
      <main className="mx-auto max-w-5xl px-5 py-10">
        <BackLink />
        <p className="mt-4 text-sm text-destructive">{error}</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-5xl px-5 py-10">
        <BackLink />
        <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking configuration…
        </p>
      </main>
    );
  }

  const isProduction = data.appEnv === "production";
  const broken = data.products.filter((p) => !p.resolves);

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <BackLink />
      <p className="label-caps">Developer</p>
      <h1 className="mt-1 text-4xl">Environment</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        What this deployment is actually pointed at. Secrets are never shown — only whether they are
        set, and a short fingerprint so two can be told apart.
      </p>

      <section className="panel mt-6 px-6 py-5">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={isProduction ? "default" : "outline"}>APP_ENV={data.appEnv}</Badge>
          <Badge variant="outline">Polar {data.polarServer}</Badge>
          <span className="font-mono text-xs text-muted-foreground">{data.polarApiBase}</span>
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">{data.accessToken.envVar}</dt>
            <dd className="mt-0.5 flex items-center gap-2">
              {data.accessToken.present ? <Yes /> : <No />}
              <span className="font-mono text-xs">{data.accessToken.fingerprint ?? "not set"}</span>
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{data.webhookSecret.envVar}</dt>
            <dd className="mt-0.5 flex items-center gap-2">
              {data.webhookSecret.present ? <Yes /> : <No />}
              <span className="font-mono text-xs">
                {data.webhookSecret.fingerprint ?? "not set"}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Supabase project</dt>
            <dd className="mt-0.5 font-mono text-xs break-all">{data.supabaseUrl ?? "not set"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">PUBLIC_APP_URL allowlist</dt>
            <dd className="mt-0.5 font-mono text-xs break-all">
              {data.appOrigins.length > 0 ? data.appOrigins.join(", ") : "not set"}
            </dd>
          </div>
        </dl>
      </section>

      {broken.length > 0 ? (
        <div className="mt-6 flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p>
            {broken.length} product{broken.length > 1 ? "s do" : " does"} not exist in the{" "}
            {data.polarServer} organisation. Checkout will fail for{" "}
            {broken.map((p) => p.key).join(", ")}.
          </p>
        </div>
      ) : null}

      <section className="panel mt-6 px-6 py-5">
        <p className="label-caps">Polar products</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="pb-2 pr-4 font-normal">Plan</th>
                <th className="pb-2 pr-4 font-normal">Source</th>
                <th className="pb-2 pr-4 font-normal">Product id</th>
                <th className="pb-2 pr-4 font-normal">Exists</th>
                <th className="pb-2 font-normal">Name in Polar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {data.products.map((p) => (
                <tr key={p.key}>
                  <td className="py-2 pr-4">{p.key}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{p.source}</td>
                  <td className="py-2 pr-4 font-mono text-xs break-all">
                    {p.productId ?? <span className="text-destructive">{p.envVar} unset</span>}
                  </td>
                  <td className="py-2 pr-4">{p.resolves ? <Yes /> : <No />}</td>
                  <td className="py-2 text-muted-foreground">{p.productName ?? p.error ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel mt-6 px-6 py-5">
        <p className="label-caps">Webhook endpoints</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Polar regenerates an endpoint&apos;s signing secret when it is synced, so a mismatch here
          is the usual reason deliveries stop being applied.
        </p>
        {data.webhookError ? (
          <p className="mt-3 text-sm text-destructive">{data.webhookError}</p>
        ) : data.webhooks.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No endpoints registered.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="pb-2 pr-4 font-normal">URL</th>
                  <th className="pb-2 pr-4 font-normal">Events</th>
                  <th className="pb-2 font-normal">Secret matches</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {data.webhooks.map((w) => (
                  <tr key={w.id}>
                    <td className="py-2 pr-4 font-mono text-xs break-all">{w.url}</td>
                    <td className="py-2 pr-4">{w.events}</td>
                    <td className="py-2">{w.secretMatches ? <Yes /> : <No />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
