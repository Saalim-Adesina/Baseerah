import { ChevronLeft } from "lucide-react";
import { useRouter } from "@tanstack/react-router";

/**
 * Sits above a page's h1 on pages you navigate *into* from the dashboard.
 * Falls back to the pipeline when there is no history to return to (deep link
 * or a fresh tab), so it never dead-ends the user.
 */
export function BackLink({ label = "Back", className = "" }: { label?: string; className?: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.history.back();
          return;
        }
        void router.navigate({ to: "/pipeline" });
      }}
      className={`mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground ${className}`}
    >
      <ChevronLeft className="h-3.5 w-3.5" /> {label}
    </button>
  );
}
