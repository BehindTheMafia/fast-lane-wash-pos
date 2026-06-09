import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusinessLine } from "@/contexts/BusinessLineContext";
import type { BusinessLine } from "@/lib/businessLine";

export function useBusinessSettings(overrideLine?: BusinessLine) {
  const { businessLine: ctxLine } = useBusinessLine();
  const businessLine = overrideLine ?? ctxLine;

  return useQuery({
    queryKey: ["business_settings", businessLine],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_settings")
        .select("*")
        .eq("business_line", businessLine)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateBusinessSettings(overrideLine?: BusinessLine) {
  const qc = useQueryClient();
  const { businessLine: ctxLine } = useBusinessLine();
  const businessLine = overrideLine ?? ctxLine;

  return useMutation({
    mutationFn: async (updates: Record<string, unknown>) => {
      const { data: existing, error: findErr } = await supabase
        .from("business_settings")
        .select("id")
        .eq("business_line", businessLine)
        .maybeSingle();
      if (findErr) throw findErr;
      if (!existing) throw new Error("No se encontró configuración para esta línea de negocio");
      const { error } = await supabase
        .from("business_settings")
        .update(updates)
        .eq("id", existing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["business_settings", businessLine] });
    },
  });
}
