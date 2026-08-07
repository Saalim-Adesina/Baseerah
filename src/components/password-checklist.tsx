import { Check, X } from "lucide-react";
import { PASSWORD_RULES } from "@/lib/password";

export function PasswordChecklist({ value }: { value: string }) {
  return (
    <ul className="grid gap-1.5 sm:grid-cols-2">
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(value);
        return (
          <li
            key={rule.id}
            className={`flex items-center gap-1.5 text-xs ${
              ok ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            {ok ? (
              <Check className="h-3.5 w-3.5 text-accent" />
            ) : (
              <X className="h-3.5 w-3.5 opacity-50" />
            )}
            {rule.label}
          </li>
        );
      })}
    </ul>
  );
}
