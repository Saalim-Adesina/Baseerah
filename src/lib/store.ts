import { useCallback, useEffect, useState } from "react";
import { DEFAULT_THESIS, type Deal, type Thesis, type Thread } from "./types";

const DEALS_KEY = "screener.deals.v1";
const THESIS_KEY = "screener.thesis.v1";
const THREADS_KEY = "screener.threads.v1";

const isBrowser = () => typeof window !== "undefined";

function read<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error("Failed to persist", key, error);
  }
}

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((fn) => fn());
}
function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/* ---------------- deals ---------------- */

export function getDeals(): Deal[] {
  return read<Deal[]>(DEALS_KEY, []);
}

export function getDeal(id: string): Deal | undefined {
  return getDeals().find((deal) => deal.id === id);
}

export function saveDeal(deal: Deal) {
  const deals = getDeals();
  const index = deals.findIndex((item) => item.id === deal.id);
  if (index >= 0) deals[index] = deal;
  else deals.unshift(deal);
  write(DEALS_KEY, deals);
  emit();
}

export function updateDeal(id: string, patch: Partial<Deal>) {
  const deal = getDeal(id);
  if (!deal) return;
  saveDeal({ ...deal, ...patch });
}

export function deleteDeal(id: string) {
  write(
    DEALS_KEY,
    getDeals().filter((deal) => deal.id !== id),
  );
  write(
    THREADS_KEY,
    getThreads().filter((thread) => thread.dealId !== id),
  );
  emit();
}

/* ---------------- thesis ---------------- */

export function getThesis(): Thesis {
  return { ...DEFAULT_THESIS, ...read<Partial<Thesis>>(THESIS_KEY, {}) } as Thesis;
}

export function saveThesis(thesis: Thesis) {
  write(THESIS_KEY, thesis);
  emit();
}

/* ---------------- threads ---------------- */

export function getThreads(): Thread[] {
  return read<Thread[]>(THREADS_KEY, []);
}

export function getDealThreads(dealId: string): Thread[] {
  return getThreads()
    .filter((thread) => thread.dealId === dealId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getThread(id: string): Thread | undefined {
  return getThreads().find((thread) => thread.id === id);
}

export function createThread(dealId: string, title = "New discussion"): Thread {
  const thread: Thread = {
    id: uid(),
    dealId,
    title,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
  };
  write(THREADS_KEY, [thread, ...getThreads()]);
  emit();
  return thread;
}

export function saveThread(thread: Thread) {
  const threads = getThreads();
  const index = threads.findIndex((item) => item.id === thread.id);
  if (index >= 0) threads[index] = thread;
  else threads.unshift(thread);
  write(THREADS_KEY, threads);
  emit();
}

export function deleteThread(id: string) {
  write(
    THREADS_KEY,
    getThreads().filter((thread) => thread.id !== id),
  );
  emit();
}

/* ---------------- hooks ---------------- */

export function useStoreValue<T>(selector: () => T): T {
  const [value, setValue] = useState<T>(selector);
  const refresh = useCallback(() => setValue(selector()), [selector]);

  useEffect(() => {
    refresh();
    const unsubscribe = subscribe(refresh);
    window.addEventListener("storage", refresh);
    return () => {
      unsubscribe();
      window.removeEventListener("storage", refresh);
    };
  }, [refresh]);

  return value;
}

export function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
