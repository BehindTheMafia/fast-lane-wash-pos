import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useBusinessSettings() {
  return useQuery({
    queryKey: ["business_settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateBusinessSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (updates: Record<string, any>) => {
      const { data: existing } = await supabase.from("business_settings").select("id").limit(1).maybeSingle();
      if (!existing) throw new Error("No settings found");
      const { error } = await supabase.from("business_settings").update(updates).eq("id", existing.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["business_settings"] }),
  });
}
