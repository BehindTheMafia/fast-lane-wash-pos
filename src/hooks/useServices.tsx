import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ── Hook for POS: active base services (not extras) ──────────────────────────
export function useServices() {
  return useQuery({
    queryKey: ["services"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*, service_prices(*)")
        .eq("is_active", true)
        .eq("is_extra", false)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

// ── Hook for POS: active extras ──────────────────────────────────────────────
export function useExtras() {
  return useQuery({
    queryKey: ["extras"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*, service_prices(*)")
        .eq("is_active", true)
        .eq("is_extra", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

// ── Hook for admin Services page: ALL services (active + inactive, base only) ─
export function useAllServices() {
  return useQuery({
    queryKey: ["all_services"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*, service_prices(*)")
        .eq("is_extra", false)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

// ── Hook for admin Services page: ALL extras (active + inactive) ─────────────
export function useAllExtras() {
  return useQuery({
    queryKey: ["all_extras"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*, service_prices(*)")
        .eq("is_extra", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

// ── Hook for Memberships: active services usable in membership plans ─────────
export function useMembershipEligibleServices() {
  return useQuery({
    queryKey: ["membership_eligible_services"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("id, name")
        .eq("is_active", true)
        .eq("is_extra", false)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}
