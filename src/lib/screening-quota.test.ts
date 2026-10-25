import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The meter is the only thing standing between a $49 plan and unlimited Azure
 * spend, so it is tested against a stubbed service-role client rather than only
 * through `screeningAllowed`. What matters here is the read-decide-write
 * sequence: a refusal must not increment, and an increment must be exactly one.
 */

type Row = {
  plan: string;
  status: string;
  deals_screened_this_period: number | null;
  current_period_end: string | null;
};

let row: Row | null;
const updates: Record<string, unknown>[] = [];
const inserts: Record<string, unknown>[] = [];

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from() {
      return {
        select() {
          return {
            eq() {
              return { maybeSingle: async () => ({ data: row, error: null }) };
            },
          };
        },
        update(values: Record<string, unknown>) {
          updates.push(values);
          return { eq: async () => ({ error: null }) };
        },
        insert: async (values: Record<string, unknown>) => {
          inserts.push(values);
          return { error: null };
        },
      };
    },
  },
}));

const { assertAndRecordScreening, ScreeningNotAllowedError } =
  await import("@/lib/screening-quota.server");

const future = () => new Date(Date.now() + 7 * 86_400_000).toISOString();
const past = () => new Date(Date.now() - 7 * 86_400_000).toISOString();

beforeEach(() => {
  row = null;
  updates.length = 0;
  inserts.length = 0;
});

describe("assertAndRecordScreening", () => {
  it("records one screening for an account under its quota", async () => {
    row = {
      plan: "angel",
      status: "active",
      deals_screened_this_period: 12,
      current_period_end: future(),
    };

    const result = await assertAndRecordScreening("user-1");

    expect(result).toEqual({ quota: 150, used: 13 });
    expect(updates).toEqual([{ deals_screened_this_period: 13 }]);
  });

  it("refuses at the quota and does not increment", async () => {
    row = {
      plan: "angel",
      status: "active",
      deals_screened_this_period: 150,
      current_period_end: future(),
    };

    await expect(assertAndRecordScreening("user-1")).rejects.toBeInstanceOf(
      ScreeningNotAllowedError,
    );
    expect(updates).toEqual([]);
  });

  it("refuses an account with no live subscription", async () => {
    row = {
      plan: "angel",
      status: "canceled",
      deals_screened_this_period: 0,
      current_period_end: future(),
    };

    await expect(assertAndRecordScreening("user-1")).rejects.toThrow(/no active subscription/i);
    expect(updates).toEqual([]);
  });

  it("starts a fresh allowance once a paid period has rolled over", async () => {
    row = {
      plan: "angel",
      status: "active",
      deals_screened_this_period: 150,
      current_period_end: past(),
    };

    const result = await assertAndRecordScreening("user-1");

    expect(result.used).toBe(1);
    expect(updates).toEqual([{ deals_screened_this_period: 1 }]);
  });

  it("refuses an elapsed trial instead of handing it a fresh allowance", async () => {
    row = {
      plan: "angel_trial",
      status: "trialing",
      deals_screened_this_period: 10,
      current_period_end: past(),
    };

    await expect(assertAndRecordScreening("user-1")).rejects.toThrow(/trial has ended/i);
    expect(updates).toEqual([]);
  });

  it("meters a trial that is still running", async () => {
    row = {
      plan: "angel_trial",
      status: "trialing",
      deals_screened_this_period: 9,
      current_period_end: future(),
    };

    const result = await assertAndRecordScreening("user-1");

    expect(result).toEqual({ quota: 10, used: 10 });
  });

  it("never refuses an unlimited plan", async () => {
    row = {
      plan: "institution",
      status: "active",
      deals_screened_this_period: 99_999,
      current_period_end: future(),
    };

    const result = await assertAndRecordScreening("user-1");

    expect(result.quota).toBeNull();
    expect(updates).toEqual([{ deals_screened_this_period: 100_000 }]);
  });

  it("re-seeds a missing subscription row rather than locking the account out", async () => {
    row = null;

    const result = await assertAndRecordScreening("user-1");

    expect(result.used).toBe(1);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      user_id: "user-1",
      plan: "angel_trial",
      status: "trialing",
      deals_screened_this_period: 1,
    });
  });

  it("treats a null counter as zero", async () => {
    row = {
      plan: "angel",
      status: "active",
      deals_screened_this_period: null,
      current_period_end: future(),
    };

    const result = await assertAndRecordScreening("user-1");

    expect(result.used).toBe(1);
  });
});
