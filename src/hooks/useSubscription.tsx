/**
 * useSubscription — manages the product subscription/access-control state.
 *
 * Storage: Supabase `system_config` table (key/value pairs).
 * Keys used:
 *   - "subscription_expiry_date"  → ISO date string "YYYY-MM-DD" | null
 *   - "subscription_locked"       → "true" | "false"
 *
 * Business rules:
 *   isBlocked = manualLock OR (expiryDate !== null AND today > expiryDate)
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

// ─── Types ───────────────────────────────────────────────────────────────────
export interface SubscriptionConfig {
  expiryDate: string | null;   // "YYYY-MM-DD" or null (no expiry)
  manualLock: boolean;          // admin can force-lock regardless of date
}

export interface SubscriptionStatus extends SubscriptionConfig {
  isBlocked: boolean;           // derived: should the system be locked?
  isLoading: boolean;
  hasError: boolean;            // true if we couldn't fetch config (e.g. missing table)
}

// ─── Config keys ─────────────────────────────────────────────────────────────
const KEY_EXPIRY = "subscription_expiry_date";
const KEY_LOCKED = "subscription_locked";

// ─── Helper: determine block status ──────────────────────────────────────────
function computeIsBlocked(expiry: string | null, locked: boolean): boolean {
  if (locked) return true;
  if (!expiry) return false;
  // Compare today (local date) vs expiry date (expires at end of expiry day)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expiry + "T00:00:00");
  return today > exp;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useSubscription(): SubscriptionStatus & {
  saveConfig: (cfg: SubscriptionConfig) => Promise<void>;
  refresh: () => Promise<void>;
} {
  const [expiryDate, setExpiryDate] = useState<string | null>(null);
  const [manualLock, setManualLock] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const fetchConfig = useCallback(async () => {
    setIsLoading(true);
    setHasError(false);
    try {
      const { data, error } = await (supabase as any)
        .from("system_config")
        .select("key, value")
        .in("key", [KEY_EXPIRY, KEY_LOCKED]);

      if (error) {
        // Table doesn't exist or query failed
        console.warn("useSubscription: query error —", error.message);
        setHasError(true);
        return;
      }

      if (data) {
        const map: Record<string, string> = {};
        for (const row of data) map[row.key] = row.value;

        const expiry = map[KEY_EXPIRY] ?? null;
        setExpiryDate(expiry === "null" || expiry === "" ? null : expiry);
        setManualLock(map[KEY_LOCKED] === "true");
      }
    } catch (e) {
      console.warn("useSubscription: could not fetch config", e);
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const saveConfig = useCallback(async (cfg: SubscriptionConfig) => {
    const rows = [
      { key: KEY_EXPIRY, value: cfg.expiryDate ?? "null" },
      { key: KEY_LOCKED, value: cfg.manualLock ? "true" : "false" },
    ];

    for (const row of rows) {
      await (supabase as any)
        .from("system_config")
        .upsert(row, { onConflict: "key" });
    }

    setExpiryDate(cfg.expiryDate);
    setManualLock(cfg.manualLock);
  }, []);

  return {
    expiryDate,
    manualLock,
    isBlocked: computeIsBlocked(expiryDate, manualLock),
    isLoading,
    hasError,
    saveConfig,
    refresh: fetchConfig,
  };
}

