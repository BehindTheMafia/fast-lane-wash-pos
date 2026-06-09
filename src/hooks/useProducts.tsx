import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useProducts() {
  return useQuery({
    queryKey: ["products", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("is_active", true)
        .eq("business_line", "barbershop")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useAllProducts() {
  return useQuery({
    queryKey: ["all_products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("business_line", "barbershop")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useLowStockProducts() {
  return useQuery({
    queryKey: ["products", "low_stock"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("is_active", true)
        .eq("business_line", "barbershop")
        .order("stock_quantity", { ascending: true });
      if (error) throw error;
      return (data || []).filter(
        (p) => p.stock_quantity <= p.min_stock_level
      );
    },
  });
}
