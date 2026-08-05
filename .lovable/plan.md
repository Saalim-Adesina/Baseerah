# Billing, Accounts and Seats: One Rulebook

Today the pieces (signup gate, checkout, webhook, billing auto-sync, reconciliation, seats) each hold their own version of the rules. This plan writes the rules down once, makes every path enforce the same rules, and backfills existing records so old accounts obey them too.

## The rules

1. **Email is the identity.** One person = one app account = one Polar customer, matched on lowercased email. Polar IDs are cached on the account, never the source of truth for matching.
2. **No second account.** If an email already has an app account, or already has billing in Polar, signup is refused and the user is routed to sign in or set a password.
3. **Plan is derived, never typed.** The plan always comes from the Polar product (with checkout metadata as a fallback), and status always comes from the Polar status.
4. **Seats are derived from the plan.** Paid seats = max(plan bundle, purchased extra seats). Cancellation returns the account to trial with 1 seat.
5. **Every account owns an admin seat row.** The owner occupies one seat, listed like anyone else; used seats = number of seat rows.
6. **Every seat is claimed by invite.** A seat row is `invited` until the invited email signs in and accepts, which links it to a real user.
7. **Everything is auditable.** Every webhook and every reconciliation fix records what came in, how it was mapped and what was written.

## Big flags — where this can fail today

These are the real problems, in order of severity. Each was confirmed in the code or the data.

1. **Seat limits are only enforced in the browser.** The Team seats panel inserts directly into the members table from the client, and the access rules only check "am I the owner" — not "does my plan allow another seat". Anyone able to call the API can exceed their plan. **Fix: move invite/role/remove behind server functions that re-check the plan ceiling.** This is the single most important change.
2. **Extra-seat purchases can break the main subscription link.** The extra-seat checkout produces its own Polar subscription. The webhook treats every subscription event the same, so an extra-seat event overwrites the account's stored subscription/product IDs with the seat product's — after which reconciliation sees a mismatch and the customer portal can point at the wrong subscription. **Fix: branch on the extra-seat product and only add seats, never touch the plan link.**
3. **No account has a guaranteed owner seat.** Confirmed in the data: of four accounts, only one has an owner admin seat row; the other three have no seat rows at all. Seat counts and role checks are therefore wrong for older accounts until backfilled.
4. **Four places independently decide plan and seats** (webhook, billing auto-sync, reconciliation, checkout metadata). They already drifted once — that was the "bought Syndicate, stayed on trial" bug. Any future rule change has to be made in four places or it silently diverges.
5. **Google sign-in bypasses the signup gate.** The duplicate-account check runs on the email/password path only, so OAuth can still create a second account for an email that already has billing in Polar.
6. **Reconciliation fixes bypass the audit trail** and can write a row shaped differently from what the webhook would write for the same subscription.
7. **Sandbox/live product ID confusion** is handled but fragile: an unmapped product silently produces "no plan resolved" rather than a loud failure.

## What changes

### A shared rules module (small, high value)
One module owns email normalisation, plan-from-product, Polar-status-to-app-status, and seats-for-plan. The signup gate, checkout, webhook, billing sync and reconciliation all import it. Removes flag 4 permanently.

### Seat assignment moves server-side (the main structural change)
Invite, accept, role change and removal become server functions that verify ownership, re-check the plan ceiling, and write through the admin path. Client write access to the members table is closed off. The panel keeps its current look; only where the write happens changes. Removes flag 1.

### Webhook handles extra-seat events separately
Extra-seat subscriptions add to the seat count and are recorded, but never overwrite the plan, product ID, or subscription link. Removes flag 2.

### Account baseline on first sign-in
Every account is ensured to have a profile, a subscription row, and an owner admin seat row, idempotently. Removes flag 3 for new accounts; the backfill handles old ones.

### Signup gate covers OAuth
The same email pre-check runs before Google sign-in completes account creation. Removes flag 5.

### Reconciliation
Extends to seat rows (missing owner seat, seats over the plan ceiling), applies fixes through the shared rules, and writes every fix to the audit table. Removes flags 6 and 7 (unmapped products become an explicit reported issue).

## Bringing existing records into line

Verified current state: four accounts. One (`artfifux1@gmail.com`) is Syndicate with Polar IDs and two seat rows including its own admin seat. The other three are trial accounts with no seat rows at all.

One-time backfill, migration plus a reconciliation pass:

1. Insert an active `admin` seat row for every account missing one, linked to the owner's own user ID and email.
2. Re-derive plan, status and seats for every Polar-linked account from live Polar data using the shared rules.
3. Reset stale paid rows: a paid plan with no live Polar subscription drops back to trial with 1 seat.
4. Flag, don't guess: Polar subscriptions with no app account, and unmapped product IDs, are reported for review, never auto-created.
5. Record the backfill in the audit table so it is visible on the audit page.

Afterwards, re-running reconciliation should report every account as `ok`. That is the acceptance test.

## Effort and risk

| Piece | Effort | Risk |
| --- | --- | --- |
| Shared rules module | Small | Low — pure refactor, covered by existing tests |
| Server-side seat writes | Medium | Medium — touches the Team seats panel and access rules; a mistake locks owners out of their own team, so it ships with tests |
| Extra-seat webhook branch | Small | Low, but needs a sandbox purchase to verify end to end |
| Account baseline on sign-in | Small | Low — idempotent, runs once per account |
| OAuth signup gate | Small | Medium — sits in the sign-in path, so a bug blocks logins; guarded to fail open on lookup errors |
| Reconciliation + seat checks | Medium | Low — reporting first, fixes are explicit actions |
| Backfill of existing records | Small | Medium — writes to live rows; runs as a reported dry run first, then applies |

Overall: a solid but contained piece of work. Most of it is consolidation of logic that already exists. The two parts that genuinely change behaviour are server-side seat enforcement and the extra-seat webhook branch, and both are verifiable in the sandbox before going live.

## Technical notes

- New `src/lib/billing-rules.ts`: `normalizeEmail`, `planForProduct`, `appStatusFor`, `seatsForPlan`, `isExtraSeatProduct`; imported by `reconcile.ts`, `polar-webhook.ts`, `account-link.functions.ts`, `billing.functions.ts`.
- New `src/lib/seats.functions.ts`: `inviteSeat`, `changeSeatRole`, `removeSeat`, `ensureOwnerSeat` — all `requireSupabaseAuth`, all re-checking `atSeatLimit`.
- Migration: tighten `team_members` access so members are written through server code, not the browser; unique index on (owner_id, lower(email)); backfill owner admin rows.
- `ensureAccountBaseline` called from the authenticated layout's first load.
- Audit rows gain `backfill` and `manual_fix` outcomes.
- Tests: seat ceiling enforcement server-side, owner-seat idempotency, extra-seat event does not clobber the plan link, and webhook/reconciliation parity on plan + status + seats.
