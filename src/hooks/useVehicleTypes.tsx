import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface VehicleType {
  id: number;
  name: string;
  key: string;
  icon: string;
  sort_order: number;
  is_active: boolean;
}

export function useVehicleTypes() {
  return useQuery<VehicleType[]>({
    queryKey: ["vehicle_types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_types")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      // Fallback icon if DB doesn't have it yet
      return (data || []).map((vt: any) => ({
        ...vt,
        icon: vt.icon || defaultIcon(vt.key),
        key: vt.key || vt.name.toLowerCase(),
      }));
    },
    staleTime: 5 * 60 * 1000, // cache 5 min
  });
}

export function useAllVehicleTypes() {
  return useQuery<VehicleType[]>({
    queryKey: ["all_vehicle_types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_types")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data || []).map((vt: any) => ({
        ...vt,
        icon: vt.icon || defaultIcon(vt.key),
        key: vt.key || vt.name.toLowerCase(),
      }));
    },
    staleTime: 5 * 60 * 1000,
  });
}

function defaultIcon(key?: string): string {
  const map: Record<string, string> = {
    moto:      "fa-motorcycle",
    sedan:     "fa-car",
    suv:       "fa-car-side",
    pickup:    "fa-truck-pickup",
    microbus:  "fa-van-shuttle",
    taxi:      "fa-taxi",
    camion3t:  "fa-truck",
  };
  return map[key || ""] || "fa-car";
}
