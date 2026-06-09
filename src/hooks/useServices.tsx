import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusinessLine } from "@/contexts/BusinessLineContext";
import type { BusinessLine } from "@/lib/businessLine";

function lineFilter(line: BusinessLine) {
  return line === "barbershop" ? "barbershop" : "car_wash";
}

// ── Hook for POS: active base services (not extras) ──────────────────────────
export function useServices() {
  const { businessLine } = useBusinessLine();
  const line = lineFilter(businessLine);

  return useQuery({
    queryKey: ["services", line, false],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*, service_prices(*)")
        .eq("is_active", true)
        .eq("is_extra", false)
        .eq("business_line", line)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

// ── Hook for POS: active extras ──────────────────────────────────────────────
export function useExtras() {
  const { businessLine } = useBusinessLine();
  const line = lineFilter(businessLine);

  return useQuery({
    queryKey: ["extras", line],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*, service_prices(*)")
        .eq("is_active", true)
        .eq("is_extra", true)
        .eq("business_line", line)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

// ── Barbería: servicios con precio fijo ──────────────────────────────────────
export function useBarberServices() {
  return useQuery({
    queryKey: ["barber_services"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .eq("is_active", true)
        .eq("is_extra", false)
        .eq("business_line", "barbershop")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

// ── Admin: all barber services ───────────────────────────────────────────────
export function useAllBarberServices() {
  return useQuery({
    queryKey: ["all_barber_services"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .eq("business_line", "barbershop")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

// ── Hook for admin Services page: ALL services (active + inactive, base only) ─
export function useAllServices() {
  return useQuery({
    queryKey: ["all_services", "car_wash"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*, service_prices(*)")
        .eq("is_extra", false)
        .eq("business_line", "car_wash")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

// ── Hook for admin Services page: ALL extras (active + inactive) ─────────────
export function useAllExtras() {
  return useQuery({
    queryKey: ["all_extras", "car_wash"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*, service_prices(*)")
        .eq("is_extra", true)
        .eq("business_line", "car_wash")
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
        .eq("business_line", "car_wash")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

// ── Mixed POS: barbershop services to display in CarWash POS ─────────────────
export function useBarberServicesForMix() {
  return useQuery({
    queryKey: ["barber_services_for_mix"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("id, name, description, icon, base_price")
        .eq("is_active", true)
        .eq("is_extra", false)
        .eq("business_line", "barbershop")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

// ── Mixed POS: car wash services (with prices) to display in Barbershop POS ──
export function useCarWashServicesForMix() {
  return useQuery({
    queryKey: ["carwash_services_for_mix"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*, service_prices(*)")
        .eq("is_active", true)
        .eq("is_extra", false)
        .eq("business_line", "car_wash")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}
