# Billing, Accounts and Seats: One Rulebook

Today the pieces (signup gate, checkout, webhook, billing auto-sync, reconciliation, seats) each hold their own version of the rules. This plan writes the rules down once, makes every path enforce the same rules, and backfills existing records so old accounts obey them too.

## The rules

1. **Email is the identity.** One person = one app account = one Polar customer, matched on lowercased email. Polar IDs are cached on the account, never the source of truth for matching.
2. **No second account.** If an email already has an app account, or already has billing in Polar, signup is refused and the user is routed to sign in or set a password.
3. **Plan is derived, never typed.** The plan always comes from the Polar product (with checkout metadata as a fallback), and status always comes from the Polar status.
4. **Seats are derived from the plan.** Paid seats = max(plan bundle, purchased seats). Cancellation returns the account to trial with 1 seat.
5. **Every account owns an admin seat row.** The owner occupies one seat, listed like anyone else; used seats = number of seat rows.
6. **Every seat is claimed by invite.** A seat row is `invited` until the invited email signs in and accepts, which links it to a real user.
7. **Everything is auditable.** Every webhook and every reconciliation fix records what came in, how it was mapped and what was written.

## What changes

### A shared rules module
A single module owns: email normalisation, plan-from-product resolution, Polar-status-to-app-status, and seats-for-plan. The signup gate, checkout, webhook handler, billing auto-sync and reconciliation all import it instead of each carrying a local copy. This removes the current drift where the webhook, the billing sync and reconciliation each decide seats slightly differently.

### Self-creation and account claiming
- Signup keeps the existing pre-check but also applies it to Google sign-in, so an OAuth signup can't create a duplicate for an email that already has billing.
- On first successful sign-in for any account, the account is ensured to have: a profile, a subscription row, and an **owner admin seat row**. This is the missing piece today.

### Seat assignment
- Owner admin seat is created automatically at account creation (rule 5), so "seats used" is correct from day one.
- Invite, accept, role change and removal all check the plan ceiling before writing, using the shared seat math.
- Removing a seat frees it immediately; a revoked invite token stops working.

### Polar reconciliation
- Reconciliation continues to diff live Polar subscriptions against app rows, but now also checks **seat rows** (does the account have an owner seat, does the seat count exceed what the plan allows) and reports those as fixable issues.
- Fixes are applied through the same rules module and written to the audit table, so a manual fix and a webhook produce identical rows.

## Bringing existing records into line

Verified current state: four accounts exist. One (`artfifux1@gmail.com`) is a Syndicate with Polar IDs and two seat rows including its own admin seat. The other three are trial accounts with **no seat rows at all**, so they have no owner admin seat.

A one-time backfill, run as a migration plus a reconciliation pass:

1. **Backfill owner admin seats** — insert an active `admin` seat row for every account that doesn't already have one, linked to the owner's own user ID and email.
2. **Re-derive plan, status and seats** for every account that has a Polar link, from live Polar data, using the shared rules.
3. **Reset stale paid rows** — any account claiming a paid plan with no live Polar subscription drops back to trial with 1 seat.
4. **Flag, don't guess** — Polar subscriptions with no app account, and unmapped product IDs, are reported for review rather than auto-created.
5. **Record the backfill** in the audit table so the changes are visible on the audit page.

After the backfill, the same reconciliation can be re-run at any time and should report every account as `ok`.

## Technical notes

- New `src/lib/billing-rules.ts` holding `normalizeEmail`, `planForProduct`, `appStatusFor`, `seatsForPlan`; `reconcile.ts`, `polar-webhook.ts`, `account-link.functions.ts` and `billing.functions.ts` import from it.
- New `ensureAccountBaseline` server-side helper called on first authenticated load, creating the missing profile / subscription / owner seat row idempotently.
- Migration: backfill `team_members` owner admin rows; add a unique index preventing two seat rows for the same owner + email.
- Reconciliation extended with `seat` verdicts and a `fixSeats` action; audit rows gain a `manual_fix` / `backfill` outcome.
- Unit tests extended for: owner-seat backfill idempotency, seat ceiling enforcement on invite, and plan/status/seat derivation parity between the webhook and reconciliation paths.
