import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearLocalAppCaches,
  clearRemotePortfolioData,
  fetchPortfolioData,
  flushOfflineBuffer,
  getLocalStorageUsage,
  loadLegacyLocalData,
  persistPortfolioChanges,
} from "../lib/dataService";
import { normalizePortfolioData, INITIAL_DATA } from "../lib/storage";
import { PortfolioData } from "../types";

const DEBOUNCE_MS = 600;

function mergePortfolioData(previous: PortfolioData, partial: Partial<PortfolioData>) {
  return normalizePortfolioData({
    ...previous,
    ...partial,
    investments: partial.investments ? { ...previous.investments, ...partial.investments } : previous.investments,
    settings: partial.settings ? { ...previous.settings, ...partial.settings } : previous.settings,
  });
}

export function useAppData() {
  const [data, setData] = useState<PortfolioData>(INITIAL_DATA);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [storageSize, setStorageSize] = useState(() => getLocalStorageUsage());
  const dataRef = useRef<PortfolioData>(INITIAL_DATA);

  // Debounce state: accumulate changed keys across rapid updateData calls and
  // flush them together as a single persistPortfolioChanges call.
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingKeysRef = useRef<Set<keyof PortfolioData>>(new Set());
  const prevSnapshotRef = useRef<PortfolioData | null>(null);

  const refreshStorageSize = useCallback(() => {
    setStorageSize(getLocalStorageUsage());
  }, []);

  // Flush any accumulated pending writes immediately. Safe to call multiple
  // times; is a no-op when nothing is pending.
  const flushPending = useCallback(async () => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const keys = [...pendingKeysRef.current];
    const snapshot = prevSnapshotRef.current;
    pendingKeysRef.current = new Set();
    prevSnapshotRef.current = null;

    if (keys.length === 0 || snapshot === null) return;

    setSyncing(true);
    try {
      await persistPortfolioChanges(snapshot, dataRef.current, keys);
      setLastSync(new Date());
    } catch (error) {
      console.error("Failed to sync portfolio changes:", error);
    } finally {
      refreshStorageSize();
      setSyncing(false);
    }
  }, [refreshStorageSize]);

  const loadAll = useCallback(async () => {
    // Persist any in-flight debounced changes before overwriting local state
    // with the authoritative remote state.
    await flushPending();
    setLoading(true);
    try {
      const nextData = await fetchPortfolioData();
      dataRef.current = nextData;
      setData(nextData);
      setLastSync(new Date());
    } catch (error) {
      console.error("Failed to load from Supabase, falling back to local data:", error);
      const localData = loadLegacyLocalData() || normalizePortfolioData({});
      dataRef.current = localData;
      setData(localData);
    } finally {
      refreshStorageSize();
      setLoading(false);
    }
  }, [refreshStorageSize, flushPending]);

  useEffect(() => {
    void loadAll();

    const onOnline = async () => {
      setSyncing(true);
      try {
        await flushOfflineBuffer();
        await loadAll();
      } finally {
        setSyncing(false);
      }
    };

    // Flush on tab hide or page unload so nothing is silently dropped.
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void flushPending();
    };
    const onUnload = () => { void flushPending(); };

    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onUnload);

    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [loadAll, flushPending]);

  const updateData = useCallback((partial: Partial<PortfolioData>) => {
    const previous = dataRef.current;
    const next = mergePortfolioData(previous, partial);
    const changedKeys = Object.keys(partial) as Array<keyof PortfolioData>;

    // Optimistic update — UI sees the change immediately.
    dataRef.current = next;
    setData(next);
    refreshStorageSize();

    if (changedKeys.length === 0) return;

    // Capture the pre-debounce snapshot only once per window (the first call
    // in the window is the true "previous" state for diffIds deletion checks).
    if (debounceTimerRef.current === null) {
      prevSnapshotRef.current = previous;
    }
    changedKeys.forEach((k) => pendingKeysRef.current.add(k));

    // Reset the 600 ms debounce timer.
    if (debounceTimerRef.current !== null) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      void flushPending();
    }, DEBOUNCE_MS);
  }, [refreshStorageSize, flushPending]);

  const clearAllData = useCallback(async () => {
    // Cancel pending debounced writes — we are about to wipe everything.
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    pendingKeysRef.current = new Set();
    prevSnapshotRef.current = null;

    await clearRemotePortfolioData();
    clearLocalAppCaches();
    const empty = normalizePortfolioData({});
    dataRef.current = empty;
    setData(empty);
    setLastSync(new Date());
    refreshStorageSize();
  }, [refreshStorageSize]);

  return {
    data,
    loading,
    syncing,
    lastSync,
    storageSize,
    loadAll,
    updateData,
    clearAllData,
  };
}
