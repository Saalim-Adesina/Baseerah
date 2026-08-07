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

A shared password policy: minimum 8 characters, at least one uppercase, one lowercase, one number, and one special character. Enforced only when creating an account or setting a new password — never on sign-in as exisisting users already set their passwords.

- A live checklist under the password field shows each rule turning green as it is met.
- Submission is blocked until all rules pass.
- All sign-up / sign-in / reset errors (invalid credentials, weak password, email already used, network issues) render in an inline message block directly beneath the submit button instead of

## 4. Rebuilt onboarding — one question per page

After account creation, new users land in a multi-step onboarding flow at `/onboarding` (one question per screen, progress bar, back/next, some questions are skippable some aren't). It runs once on first account creation; the app records completion and does not show it again. 

Questions, in order:

1. How many deals do you review per month? (range buckets: <10, 10–25, 26–50, 51–100, 100+) (mandatory)
2. How do you currently review deals? (manual reading, spreadsheet, analyst/team, CRM workflow, other) (mandatory)
3. How long do you spend reviewing per month? (hour buckets) (mandatory)
4. What other tools do you use? (multi-select tiles with real logos: PitchBook, HubSpot, Affinity, Dealroom, Crunchbase, Airtable, Notion, Salesforce, plus "none") (optional)
5. Which industries do you invest in? (Fintech, Deep Tech / Agriculture / HealthTech / Food Tech / other categories + free text)
6. How would you describe your investment thesis in one sentence.
7. What is your check size?
8. How did you hear about Baseerah? (Word of mouth -> next question is: type person name,LinkedIn , X/Twitter, search, Networking event, other) (mandatory)
9. Do you want to connect your deal inbox (yes or no) — if yes shows the user's private Baseerah forwarding address with a copy button and short Gmail/Outlook forwarding-rule instructions, plus a "verify by sending a test forward" note.

Answers automatically feed settings: check size, industries, investment thesis, industries are written onto the end of the investment thesis (preferred sectors) so the scoring engine picks them up immediately, and the tools/discovery answers are stored on the profile for later reporting.

## Technical notes

- New `onboarding_responses` table (one row per user, JSON answers + `completed_at`), with grants and RLS scoped to `auth.uid()`; profile gains an `onboarding_completed_at` marker. Writes go through an authenticated server function.
- Industry answers are merged into the existing thesis storage so screening prompts change without extra user action, settings page also includes a multi select option which dynamically changes the investment thesis paragraph too.
- Onboarding routes live under the authenticated layout; the layout redirects users without a completion marker into the flow.
- Real tool logos come from a web search for the company logos. It is being used as a display of competitors, include small text that these are trademarks and not propert of baseerah
- Password validation lives in a shared module used by both the signup form and the reset-password page.
- Theme changes are confined to `src/styles.css` tokens plus spacing tweaks in page layouts.