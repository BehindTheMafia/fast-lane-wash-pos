import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useServices() {
  return useQuery({
    queryKey: ["services"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*, service_prices(*)")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useAllServices() {
  return useQuery({
    queryKey: ["all_services"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*, service_prices(*)")
        .order("name");
      if (error) throw error;
      return data;
    },
  });
}
