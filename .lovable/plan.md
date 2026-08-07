# Baseerah rebrand, light theme, stronger auth, and guided onboarding

## 1. Rename to Baseerah

Replace every "Meridian" reference across the landing page, auth pages, invite page, pipeline, deal pages, thesis, billing, admin, webhook audit, and page titles/meta descriptions. The private forwarding address becomes `deals-xxxxxxxx@inbox.baseerah.dev`, and Polar checkout/portal copy is updated to match.

## 2. Light theme with dark blue + turquoise

Rework the design tokens so the app is light-first and airy:

- Canvas: near-white with a very light cool grey for panels.
- Primary: `#131922` (dark blue/near-black navy) for headings, buttons and nav.
- Accent: `#77c9b3` (turquoise) for highlights, active states, positive signals.
- Signals: turquoise for strong, amber for mid, muted red for weak.
- Whitespace: larger section padding, wider gutters, more line spacing, thinner borders, softer shadows, fewer heavy filled panels.

All values stay semantic tokens in `src/styles.css`; no hardcoded colors in components.

## 3. Password rules and inline error display

A shared password policy: minimum 8 characters, at least one uppercase, one lowercase, one number, and one special character. Enforced only when creating an account or setting a new password — never on sign-in (so existing users are not locked out).

- A live checklist under the password field shows each rule turning green as it is met.
- Submission is blocked until all rules pass.
- All sign-up / sign-in / reset errors (invalid credentials, weak password, email already used, network issues) render in an inline message block directly beneath the submit button instead of only as a toast.

## 4. Rebuilt onboarding — one question per page

After account creation, new users land in a multi-step onboarding flow at `/onboarding` (one question per screen, progress bar, back/next, and a "Skip this question" link on each step). It runs once; the app records completion and does not show it again. Users who skip everything still reach the pipeline.

Questions, in order:

1. How many deals do you review per month? (range buckets: <10, 10–25, 26–50, 51–100, 100+)
2. How do you currently review deals? (manual reading, spreadsheet, analyst/team, CRM workflow, other)
3. How long do you spend reviewing per month? (hour buckets)
4. What other tools do you use? (multi-select tiles with real logos: PitchBook, HubSpot, Affinity, Dealroom, Crunchbase, Airtable, Notion, Salesforce, plus "none")
5. Which industries do you invest in? (multi-select tags + free text)
6. How did you hear about Baseerah? (referral, X/Twitter, LinkedIn, podcast, search, event, other)
7. Connect your deal inbox — shows the user's private Baseerah forwarding address with a copy button and short Gmail/Outlook forwarding-rule instructions, plus a "verify by sending a test forward" note.

Answers automatically feed settings: deal volume and review time set the expected screening throughput shown on the pipeline, industries are written into the investment thesis (preferred sectors) so the scoring engine picks them up immediately, and the tools/discovery answers are stored on the profile for later reporting.

## Technical notes

- New `onboarding_responses` table (one row per user, JSON answers + `completed_at`), with grants and RLS scoped to `auth.uid()`; profile gains an `onboarding_completed_at` marker. Writes go through an authenticated server function.
- Industry answers are merged into the existing thesis storage so screening prompts change without extra user action.
- Onboarding routes live under the authenticated layout; the layout redirects users without a completion marker into the flow.
- Real tool logos come from the Logo.dev connector (`img.logo.dev` by company domain) — I will prompt you to connect it. If you would rather not, I will fall back to name + icon tiles.
- Password validation lives in a shared module used by both the signup form and the reset-password page.
- Theme changes are confined to `src/styles.css` tokens plus spacing tweaks in page layouts.
