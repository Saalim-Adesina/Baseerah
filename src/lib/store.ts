import { useCallback, useEffect, useState } from "react";
import { DEFAULT_THESIS, type Deal, type Thesis, type Thread } from "./types";
import * as api from "./deals.functions";

/**
 * Client-side mirror of the account's pipeline.
 *
 * Deals, thesis and threads live in Postgres and are shared by everyone holding
 * a seat on the account. This module keeps a read cache so components can stay
 * synchronous, and writes through to the server: every mutation updates the
 * cache optimistically, fires the server function, and rolls back on failure.
 */

const LEGACY_DEALS_KEY = "screener.deals.v1";
const LEGACY_THESIS_KEY = "screener.thesis.v1";
const LEGACY_THREADS_KEY = "screener.threads.v1";

const isBrowser = () => typeof window !== "undefined";

type Cache = {
  deals: Deal[];
  thesis: Thesis;
  threadsByDeal: Record<string, Thread[]>;
  hydrated: boolean;
};

const cache: Cache = {
  deals: [],
  thesis: { ...DEFAULT_THESIS },
  threadsByDeal: {},
  hydrated: false,
};

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((fn) => fn());
}
function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/* ---------------- hydration ---------------- */

let hydration: Promise<void> | undefined;

/**
 * Loads the account's pipeline once per page load. Safe to call from several
 * components — they all await the same promise.
 */
export function hydrateStore(): Promise<void> {
  if (!hydration) hydration = loadEverything();
  return hydration;
}

async function loadEverything() {
  try {
    await importLegacyLocalPipeline();
    const [deals, thesis] = await Promise.all([api.listDeals(), api.getThesis()]);
    cache.deals = deals;
    cache.thesis = thesis;
  } finally {
    cache.hydrated = true;
    emit();
  }
}

/** Re-reads the pipeline from the server, e.g. after a Gmail import. */
export async function refreshDeals() {
  cache.deals = await api.listDeals();
  emit();
}

/* ---------------- one-time localStorage migration ---------------- */

function readLegacy<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Pipelines built before deals moved server-side still sit in this browser.
 * Push them up once — the server refuses a second import for the same user, so
 * a reload or another device cannot duplicate them.
 */
async function importLegacyLocalPipeline() {
  if (!isBrowser()) return;
  const legacyDeals = readLegacy<Deal[]>(LEGACY_DEALS_KEY, []);
  const legacyThesis = readLegacy<Partial<Thesis> | null>(LEGACY_THESIS_KEY, null);
  if (!legacyDeals.length && !legacyThesis) return;

  try {
    await api.importLocalPipeline({
      data: {
        deals: legacyDeals.map(toDealInput),
        ...(legacyThesis ? { thesis: { ...DEFAULT_THESIS, ...legacyThesis } } : {}),
      },
    });
    // Keep a copy under a parked key rather than deleting: if anything went
    // wrong the data is still recoverable from this browser.
    window.localStorage.setItem(
      "screener.migrated.v1",
      JSON.stringify({
        at: new Date().toISOString(),
        deals: legacyDeals,
        thesis: legacyThesis,
        threads: readLegacy<Thread[]>(LEGACY_THREADS_KEY, []),
      }),
    );
    window.localStorage.removeItem(LEGACY_DEALS_KEY);
    window.localStorage.removeItem(LEGACY_THESIS_KEY);
    window.localStorage.removeItem(LEGACY_THREADS_KEY);
  } catch (error) {
    console.error("Could not import the local pipeline", error);
  }
}

/** Strips server-owned fields so a cached deal can be sent as input. */
function toDealInput(deal: Deal) {
  const { id: _id, createdAt: _createdAt, ...rest } = deal;
  return rest;
}

/* ---------------- deals ---------------- */

export function getDeals(): Deal[] {
  return cache.deals;
}

export function getDeal(id: string): Deal | undefined {
  return cache.deals.find((deal) => deal.id === id);
}

/**
 * Creates or updates a deal. Returns the stored deal — callers that navigate to
 * it must use the returned id, since the server mints it.
 */
export async function saveDeal(deal: Deal): Promise<Deal> {
  const existing = getDeal(deal.id);

  if (!existing) {
    const created = await api.createDeal({ data: { deal: toDealInput(deal) } });
    cache.deals = [created, ...cache.deals];
    emit();
    return created;
  }

  const previous = cache.deals;
  cache.deals = cache.deals.map((item) => (item.id === deal.id ? deal : item));
  emit();
  try {
    const saved = await api.updateDeal({ data: { id: deal.id, patch: toDealInput(deal) } });
    cache.deals = cache.deals.map((item) => (item.id === saved.id ? saved : item));
    emit();
    return saved;
  } catch (error) {
    cache.deals = previous;
    emit();
    throw error;
  }
}

export async function updateDeal(id: string, patch: Partial<Deal>): Promise<Deal | undefined> {
  const deal = getDeal(id);
  if (!deal) return undefined;
  return saveDeal({ ...deal, ...patch });
}

export async function deleteDeal(id: string) {
  const previous = cache.deals;
  cache.deals = cache.deals.filter((deal) => deal.id !== id);
  delete cache.threadsByDeal[id];
  emit();
  try {
    await api.deleteDeal({ data: { id } });
  } catch (error) {
    cache.deals = previous;
    emit();
    throw error;
  }
}

/* ---------------- thesis ---------------- */

export function getThesis(): Thesis {
  return cache.thesis;
}

export async function saveThesis(thesis: Thesis) {
  const previous = cache.thesis;
  cache.thesis = thesis;
  emit();
  try {
    await api.saveThesis({ data: { thesis } });
  } catch (error) {
    cache.thesis = previous;
    emit();
    throw error;
  }
}

/* ---------------- threads ---------------- */

const threadLoads = new Map<string, Promise<Thread[]>>();

/** Threads for a deal, loading them on first access. */
export function getDealThreads(dealId: string): Thread[] {
  const cached = cache.threadsByDeal[dealId];
  if (cached) return cached;
  void loadThreads(dealId);
  return [];
}

export function loadThreads(dealId: string): Promise<Thread[]> {
  const inFlight = threadLoads.get(dealId);
  if (inFlight) return inFlight;

  const request = api
    .listThreads({ data: { dealId } })
    .then((threads) => {
      cache.threadsByDeal[dealId] = threads;
      emit();
      return threads;
    })
    .finally(() => threadLoads.delete(dealId));

  threadLoads.set(dealId, request);
  return request;
}

export function getThread(id: string): Thread | undefined {
  for (const threads of Object.values(cache.threadsByDeal)) {
    const found = threads.find((thread) => thread.id === id);
    if (found) return found;
  }
  return undefined;
}

export async function createThread(dealId: string, title = "New discussion"): Promise<Thread> {
  const thread = await api.createThread({ data: { dealId, title } });
  cache.threadsByDeal[dealId] = [thread, ...(cache.threadsByDeal[dealId] ?? [])];
  emit();
  return thread;
}

export async function saveThread(thread: Thread) {
  const dealThreads = cache.threadsByDeal[thread.dealId] ?? [];
  const previous = dealThreads;
  cache.threadsByDeal[thread.dealId] = dealThreads.map((item) =>
    item.id === thread.id ? thread : item,
  );
  emit();
  try {
    await api.saveThread({
      data: { id: thread.id, title: thread.title, messages: thread.messages },
    });
  } catch (error) {
    cache.threadsByDeal[thread.dealId] = previous;
    emit();
    throw error;
  }
}

export async function deleteThread(id: string) {
  const thread = getThread(id);
  if (!thread) return;
  const previous = cache.threadsByDeal[thread.dealId] ?? [];
  cache.threadsByDeal[thread.dealId] = previous.filter((item) => item.id !== id);
  emit();
  try {
    await api.deleteThread({ data: { id } });
  } catch (error) {
    cache.threadsByDeal[thread.dealId] = previous;
    emit();
    throw error;
  }
}

/* ---------------- hooks ---------------- */

export function useStoreValue<T>(selector: () => T): T {
  const [value, setValue] = useState<T>(selector);
  const refresh = useCallback(() => setValue(selector()), [selector]);

  useEffect(() => {
    void hydrateStore();
    refresh();
    return subscribe(refresh);
  }, [refresh]);

  return value;
}

/** True once the account's pipeline has loaded (or failed to load). */
export function useHydrated() {
  const [hydrated, setHydrated] = useState(cache.hydrated);

  useEffect(() => {
    if (cache.hydrated) {
      setHydrated(true);
      return;
    }
    const unsubscribe = subscribe(() => setHydrated(cache.hydrated));
    void hydrateStore();
    return unsubscribe;
  }, []);

  return hydrated;
}
