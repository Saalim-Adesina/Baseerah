import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useNavigate,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { useIsDeveloper, useSession } from "@/lib/account";
import { Menu, X } from "lucide-react";

import appCss from "../styles.css?url";
import navbarLogo from "@/assets/navbar_logo.png";
import { reportClientError } from "../lib/client-error-reporting";
import {
  clearStaleChunkReloadFlag,
  isStaleChunkError,
  reloadOnceForStaleChunk,
} from "../lib/stale-chunk";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const stale = isStaleChunkError(error);
  useEffect(() => {
    if (reloadOnceForStaleChunk(error)) return;
    reportClientError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  if (stale) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Baseerah — Investment Deal Screening" },
      {
        name: "description",
        content:
          "Automated startup deal screening for VCs, incubators and private equity: thesis-driven scoring, IC memos and deal chat.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=JetBrains+Mono:wght@400;500&display=swap",
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

/**
 * Google's OAuth consent screen requires a privacy policy and terms URL, and
 * reviewers check that both are reachable from the app itself — not just as
 * bare URLs pasted into the console.
 */
function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-xs text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} Baseerah</p>
        <nav className="flex gap-4">
          <Link to="/privacy" className="transition-colors hover:text-foreground">
            Privacy
          </Link>
          <Link to="/terms" className="transition-colors hover:text-foreground">
            Terms
          </Link>
        </nav>
      </div>
    </footer>
  );
}

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function TopNav() {
  const { user, loading } = useSession();
  const isDeveloper = useIsDeveloper();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    setMobileOpen(false);
    navigate({ to: "/auth", search: { mode: "signin" }, replace: true });
  }

  const linkClass =
    "rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground [&.active]:bg-secondary [&.active]:text-foreground";
  const mobileLinkClass =
    "block rounded-md px-3 py-2.5 text-base font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground [&.active]:bg-secondary [&.active]:text-foreground";
  const ctaClass =
    "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90";
  const mobileCtaClass =
    "block rounded-md bg-primary px-3 py-2.5 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90";

  const NavLinks = ({ mobile = false }: { mobile?: boolean }) => (
    <>
      {user ? (
        <>
          <Link
            to="/pipeline"
            className={mobile ? mobileLinkClass : linkClass}
            onClick={() => mobile && setMobileOpen(false)}
          >
            Pipeline
          </Link>
          <Link
            to="/deals/new"
            className={mobile ? mobileLinkClass : linkClass}
            onClick={() => mobile && setMobileOpen(false)}
          >
            New deal
          </Link>
          <Link
            to="/thesis"
            className={mobile ? mobileLinkClass : linkClass}
            onClick={() => mobile && setMobileOpen(false)}
          >
            Thesis
          </Link>
          <Link
            to="/billing"
            className={mobile ? mobileLinkClass : linkClass}
            onClick={() => mobile && setMobileOpen(false)}
          >
            Plan
          </Link>
          <Link
            to="/settings"
            className={mobile ? mobileLinkClass : linkClass}
            onClick={() => mobile && setMobileOpen(false)}
          >
            Settings
          </Link>
          {isDeveloper ? (
            <Link
              to="/admin"
              className={mobile ? mobileLinkClass : linkClass}
              onClick={() => mobile && setMobileOpen(false)}
            >
              Admin
            </Link>
          ) : null}
        </>
      ) : null}
    </>
  );

  const AuthActions = ({ mobile = false }: { mobile?: boolean }) => (
    <>
      {loading ? null : user ? (
        <button
          type="button"
          onClick={handleSignOut}
          className={mobile ? mobileLinkClass : linkClass}
        >
          Sign out
        </button>
      ) : (
        <>
          <Link
            to="/auth"
            search={{ mode: "signin" }}
            className={mobile ? mobileLinkClass : linkClass}
            onClick={() => mobile && setMobileOpen(false)}
          >
            Sign in
          </Link>
          <Link
            to="/auth"
            search={{ mode: "signup" }}
            className={mobile ? mobileCtaClass : ctaClass}
            onClick={() => mobile && setMobileOpen(false)}
          >
            Create account
          </Link>
        </>
      )}
    </>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-5">
        <Link to={user ? "/pipeline" : "/"} className="flex shrink-0 items-center">
          <img src={navbarLogo} alt="Baseerah" className="h-7 w-auto shrink-0 object-contain" />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden flex-1 items-center gap-1 text-sm sm:flex">
          <NavLinks />
        </nav>
        <div className="hidden items-center gap-1 sm:flex">
          <AuthActions />
        </div>

        {/* Mobile menu trigger */}
        <div className="flex flex-1 justify-end sm:hidden">
          <button
            type="button"
            aria-label="Open menu"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(true)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-secondary"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Mobile slide-out panel */}
          <div
            className={
              "fixed inset-0 z-50 sm:hidden " +
              (mobileOpen ? "pointer-events-auto" : "pointer-events-none")
            }
            aria-hidden={!mobileOpen}
          >
            <div
              className={
                "absolute inset-0 bg-black/40 transition-opacity duration-300 " +
                (mobileOpen ? "opacity-100" : "opacity-0")
              }
              onClick={() => setMobileOpen(false)}
            />
            <div
              className={
                "absolute right-0 top-0 h-full w-[280px] border-l border-border bg-background p-5 shadow-xl transition-transform duration-300 " +
                (mobileOpen ? "translate-x-0" : "translate-x-full")
              }
            >
              <div className="flex items-center justify-between">
                <span className="font-display text-lg tracking-tight">Menu</span>
                <button
                  type="button"
                  aria-label="Close menu"
                  onClick={() => setMobileOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-secondary"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <nav className="mt-6 flex flex-col gap-1">
                <NavLinks mobile />
                <div className="my-3 border-t border-border" />
                <AuthActions mobile />
              </nav>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => data.subscription.unsubscribe();
  }, [router, queryClient]);

  // A deploy swaps the hashed chunks under open tabs; the next lazy route import
  // then fails and renders a blank screen. Reload once to pick up fresh assets.
  useEffect(() => {
    clearStaleChunkReloadFlag();
    const onPreloadError = (event: Event) => {
      reloadOnceForStaleChunk((event as Event & { payload?: unknown }).payload ?? event);
    };
    const onRejection = (event: PromiseRejectionEvent) => reloadOnceForStaleChunk(event.reason);
    window.addEventListener("vite:preloadError", onPreloadError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("vite:preloadError", onPreloadError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex min-h-screen flex-col">
        <TopNav />
        <div className="flex-1">
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <Outlet />
        </div>
        <SiteFooter />
      </div>
      <Toaster position="top-right" />
    </QueryClientProvider>
  );
}
