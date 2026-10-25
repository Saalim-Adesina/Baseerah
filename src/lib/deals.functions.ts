import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import {
  DEFAULT_THESIS,
  type Analysis,
  type Deal,
  type PassEmail,
  type Round,
  type Thesis,
  type Thread,
} from "@/lib/types";

/**
 * Server-side pipeline storage. Every query runs through the caller's own
 * Supabase client (the auth middleware binds their JWT), so row-level security
 * decides which account's rows are visible — the tenancy rule lives in the
 * database, not here.
 */

/* ---------------- row <-> app type mapping ---------------- */

type DealRow = {
  id: string;
  created_at: string;
  company: string;
  website: string;
  one_liner: string;
  sector: string;
  geography: string;
  round: string;
  raising: string;
  valuation: string;
  traction: string;
  unit_economics: string;
  competition: string;
  founders: unknown;
  meeting_notes: string;
  personal_bias: string;
  deck_text: string;
  deck_file_name: string;
  status: string;
  analysis: unknown;
  memo: string | null;
  pass_email: unknown;
};

function toDeal(row: DealRow): Deal {
  return {
    id: row.id,
    createdAt: new Date(row.created_at).getTime(),
    company: row.company,
    website: row.website,
    oneLiner: row.one_liner,
    sector: row.sector,
    geography: row.geography,
    round: row.round as Round | "",
    raising: row.raising,
    valuation: row.valuation,
    traction: row.traction,
    unitEconomics: row.unit_economics,
    competition: row.competition,
    founders: (row.founders as Deal["founders"]) ?? [],
    meetingNotes: row.meeting_notes,
    personalBias: row.personal_bias,
    deckText: row.deck_text,
    deckFileName: row.deck_file_name,
    status: row.status as Deal["status"],
    ...(row.analysis ? { analysis: row.analysis as Analysis } : {}),
    ...(row.memo ? { memo: row.memo } : {}),
    ...(row.pass_email ? { passEmail: row.pass_email as PassEmail } : {}),
  };
}

/** App-shaped patch to column names. Only defined keys are written. */
type DealUpdate = Database["public"]["Tables"]["deals"]["Update"];
type ThreadUpdate = Database["public"]["Tables"]["deal_threads"]["Update"];

function toColumns(patch: Partial<Deal>): DealUpdate {
  const map: Record<string, string> = {
    company: "company",
    website: "website",
    oneLiner: "one_liner",
    sector: "sector",
    geography: "geography",
    round: "round",
    raising: "raising",
    valuation: "valuation",
    traction: "traction",
    unitEconomics: "unit_economics",
    competition: "competition",
    founders: "founders",
    meetingNotes: "meeting_notes",
    personalBias: "personal_bias",
    deckText: "deck_text",
    deckFileName: "deck_file_name",
    status: "status",
    analysis: "analysis",
    memo: "memo",
    passEmail: "pass_email",
  };
  const row: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(map)) {
    const value = (patch as Record<string, unknown>)[key];
    if (value !== undefined) row[column] = value;
  }
  return row;
}

const DEAL_COLUMNS =
  "id,created_at,company,website,one_liner,sector,geography,round,raising,valuation,traction,unit_economics,competition,founders,meeting_notes,personal_bias,deck_text,deck_file_name,status,analysis,memo,pass_email";

/* ---------------- validation ---------------- */

const dealInput = z
  .object({
    company: z.string().max(200),
    website: z.string().max(500),
    oneLiner: z.string().max(1000),
    sector: z.string().max(300),
    geography: z.string().max(300),
    round: z.string().max(50),
    raising: z.string().max(100),
    valuation: z.string().max(100),
    traction: z.string().max(20000),
    unitEconomics: z.string().max(20000),
    competition: z.string().max(20000),
    founders: z
      .array(
        z.object({
          id: z.string().max(100),
          name: z.string().max(200),
          role: z.string().max(200),
          linkedin: z.string().max(500),
          background: z.string().max(5000),
        }),
      )
      .max(20),
    meetingNotes: z.string().max(50000),
    personalBias: z.string().max(20000),
    deckText: z.string().max(400000),
    deckFileName: z.string().max(300),
    status: z.enum(["new", "analyzed", "shortlist", "passed"]),
    analysis: z.unknown().optional(),
    memo: z.string().max(200000).optional(),
    passEmail: z.unknown().optional(),
  })
  .partial();

const uuid = z.string().uuid();

/* ---------------- deals ---------------- */

export const listDeals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("deals")
      .select(DEAL_COLUMNS)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as DealRow[]).map(toDeal);
  });

export const createDeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ deal: dealInput, gmailMessageId: z.string().max(200).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: accountId, error: accountError } =
      await context.supabase.rpc("current_account_id");
    if (accountError) throw new Error(accountError.message);

    const { data: row, error } = await context.supabase
      .from("deals")
      .insert({
        ...toColumns(data.deal as Partial<Deal>),
        account_id: accountId,
        created_by: context.userId,
        ...(data.gmailMessageId ? { gmail_message_id: data.gmailMessageId } : {}),
      })
      .select(DEAL_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return toDeal(row as unknown as DealRow);
  });

/**
 * Gmail message ids already imported as deals. Seeds the skip list on a re-scan
 * so a mailbox that has been scanned before does not re-extract the same decks
 * (each extraction is a paid Document Intelligence call).
 */
export const listImportedGmailMessageIds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("deals")
      .select("gmail_message_id")
      .not("gmail_message_id", "is", null);
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as { gmail_message_id: string | null }[])
      .map((row) => row.gmail_message_id)
      .filter((id): id is string => Boolean(id));
  });

export const updateDeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: uuid, patch: dealInput }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("deals")
      .update(toColumns(data.patch as Partial<Deal>))
      .eq("id", data.id)
      .select(DEAL_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return toDeal(row as unknown as DealRow);
  });

export const deleteDeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("deals").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- thesis ---------------- */

type ThesisRow = {
  fund_name: string;
  partner_name: string;
  statement: string;
  preferred_industries: string;
  anti_portfolio: string;
  stage_focus: string;
  check_size: string;
  model_instructions: string;
  temperature: number;
  weights: unknown;
};

const THESIS_COLUMNS =
  "fund_name,partner_name,statement,preferred_industries,anti_portfolio,stage_focus,check_size,model_instructions,temperature,weights";

function toThesis(row: ThesisRow | null): Thesis {
  if (!row) return { ...DEFAULT_THESIS };
  return {
    fundName: row.fund_name || DEFAULT_THESIS.fundName,
    partnerName: row.partner_name || DEFAULT_THESIS.partnerName,
    statement: row.statement,
    preferredIndustries: row.preferred_industries,
    antiPortfolio: row.anti_portfolio,
    stageFocus: row.stage_focus,
    checkSize: row.check_size,
    modelInstructions: row.model_instructions,
    temperature: Number(row.temperature),
    weights: (row.weights as Record<string, number>) ?? {},
  };
}

const thesisInput = z.object({
  fundName: z.string().max(200),
  partnerName: z.string().max(200),
  statement: z.string().max(20000),
  preferredIndustries: z.string().max(5000),
  antiPortfolio: z.string().max(5000),
  stageFocus: z.string().max(2000),
  checkSize: z.string().max(500),
  modelInstructions: z.string().max(20000),
  temperature: z.number().min(0).max(2),
  weights: z.record(z.string(), z.number()),
});

export const getThesis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("theses")
      .select(THESIS_COLUMNS)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return toThesis(data as unknown as ThesisRow | null);
  });

export const saveThesis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ thesis: thesisInput }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: accountId, error: accountError } =
      await context.supabase.rpc("current_account_id");
    if (accountError) throw new Error(accountError.message);

    const { thesis } = data;
    const { error } = await context.supabase.from("theses").upsert(
      {
        account_id: accountId,
        fund_name: thesis.fundName,
        partner_name: thesis.partnerName,
        statement: thesis.statement,
        preferred_industries: thesis.preferredIndustries,
        anti_portfolio: thesis.antiPortfolio,
        stage_focus: thesis.stageFocus,
        check_size: thesis.checkSize,
        model_instructions: thesis.modelInstructions,
        temperature: thesis.temperature,
        weights: thesis.weights,
      },
      { onConflict: "account_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- chat threads ---------------- */

type ThreadRow = {
  id: string;
  deal_id: string;
  title: string;
  messages: unknown;
  created_at: string;
  updated_at: string;
};

function toThread(row: ThreadRow): Thread {
  return {
    id: row.id,
    dealId: row.deal_id,
    title: row.title,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    messages: (row.messages as Thread["messages"]) ?? [],
  };
}

const THREAD_COLUMNS = "id,deal_id,title,messages,created_at,updated_at";

export const listThreads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ dealId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("deal_threads")
      .select(THREAD_COLUMNS)
      .eq("deal_id", data.dealId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ((rows ?? []) as unknown as ThreadRow[]).map(toThread);
  });

export const createThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ dealId: uuid, title: z.string().max(300).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: accountId, error: accountError } =
      await context.supabase.rpc("current_account_id");
    if (accountError) throw new Error(accountError.message);

    const { data: row, error } = await context.supabase
      .from("deal_threads")
      .insert({
        account_id: accountId,
        deal_id: data.dealId,
        created_by: context.userId,
        title: data.title ?? "New discussion",
      })
      .select(THREAD_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return toThread(row as unknown as ThreadRow);
  });

export const saveThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        id: uuid,
        title: z.string().max(300).optional(),
        messages: z.array(z.any()).max(1000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: ThreadUpdate = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.messages !== undefined) patch.messages = data.messages;

    const { data: row, error } = await context.supabase
      .from("deal_threads")
      .update(patch)
      .eq("id", data.id)
      .select(THREAD_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return toThread(row as unknown as ThreadRow);
  });

export const deleteThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("deal_threads").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- one-time localStorage import ---------------- */

/**
 * Pushes a browser's leftover pipeline into the account once. Guarded by
 * `local_import_marks`, so a second browser (or a reload) cannot duplicate it.
 */
export const importLocalPipeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        deals: z.array(dealInput).max(500),
        thesis: thesisInput.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: mark, error: markError } = await context.supabase
      .from("local_import_marks")
      .select("user_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (markError) throw new Error(markError.message);
    if (mark) return { imported: 0, skipped: "already-imported" as const };

    const { data: accountId, error: accountError } =
      await context.supabase.rpc("current_account_id");
    if (accountError) throw new Error(accountError.message);

    if (data.deals.length) {
      const rows = data.deals.map((deal) => ({
        ...toColumns(deal as Partial<Deal>),
        account_id: accountId,
        created_by: context.userId,
      }));
      const { error } = await context.supabase.from("deals").insert(rows);
      if (error) throw new Error(error.message);
    }

    // A brand-new account starts on the default thesis; only carry the local
    // one over when the browser actually has one.
    if (data.thesis) {
      const { thesis } = data;
      const { error } = await context.supabase.from("theses").upsert(
        {
          account_id: accountId,
          fund_name: thesis.fundName,
          partner_name: thesis.partnerName,
          statement: thesis.statement,
          preferred_industries: thesis.preferredIndustries,
          anti_portfolio: thesis.antiPortfolio,
          stage_focus: thesis.stageFocus,
          check_size: thesis.checkSize,
          model_instructions: thesis.modelInstructions,
          temperature: thesis.temperature,
          weights: thesis.weights,
        },
        { onConflict: "account_id" },
      );
      if (error) throw new Error(error.message);
    }

    const { error: insertMarkError } = await context.supabase
      .from("local_import_marks")
      .insert({ user_id: context.userId, deal_count: data.deals.length });
    if (insertMarkError) throw new Error(insertMarkError.message);

    return { imported: data.deals.length, skipped: null };
  });
