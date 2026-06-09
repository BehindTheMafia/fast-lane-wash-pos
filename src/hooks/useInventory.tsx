import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface InventoryProduct {
  id: number;
  name: string;
  description: string;
  sku: string;
  price: number;
  stock_quantity: number;
  min_stock_level: number;
  is_active: boolean;
  sort_order: number;
  icon: string;
  business_line: string;
  created_at: string;
  updated_at: string;
}

export interface StockMovement {
  id: number;
  product_id: number;
  quantity_delta: number;
  reason: "sale" | "adjustment" | "restock";
  ticket_id: number | null;
  user_id: string | null;
  notes: string;
  created_at: string;
}

export function useInventoryProducts() {
  return useQuery({
    queryKey: ["inventory_products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("business_line", "barbershop")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data || []) as InventoryProduct[];
    },
  });
}

export function useProductMovements(productId: number | null) {
  return useQuery({
    queryKey: ["stock_movements", productId],
    enabled: !!productId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select("*")
        .eq("product_id", productId!)
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data || []) as StockMovement[];
    },
  });
}
