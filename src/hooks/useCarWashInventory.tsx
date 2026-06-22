import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CarWashProduct {
  id: number;
  name: string;
  description: string;
  sku: string;
  stock_quantity: number;
  min_stock_level: number;
  services_per_unit: number;
  usage_count: number;
  is_active: boolean;
  sort_order: number;
  icon: string;
  business_line: string;
  created_at: string;
  updated_at: string;
}

export interface ServiceProduct {
  id: number;
  service_id: number;
  product_id: number;
}

export interface InventoryCheckProduct {
  id: number;
  name: string;
  stock_quantity: number;
  services_per_unit: number;
  usage_count: number;
  available: number;
}

export interface InventoryCheckResult {
  ok: boolean;
  products: InventoryCheckProduct[];
  skipped?: boolean;
}

/** Derived metric: total service uses remaining for a product. */
export function computeAvailableServices(p: Pick<CarWashProduct, "stock_quantity" | "services_per_unit" | "usage_count">): number {
  return p.stock_quantity * p.services_per_unit - p.usage_count;
}

export function useCarWashProducts() {
  return useQuery({
    queryKey: ["car_wash_products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("business_line", "car_wash")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data || []) as CarWashProduct[];
    },
  });
}

export function useServiceProducts(serviceId: number | null) {
  return useQuery({
    queryKey: ["service_products", serviceId],
    enabled: !!serviceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_products")
        .select("*")
        .eq("service_id", serviceId!);
      if (error) throw error;
      return (data || []) as ServiceProduct[];
    },
  });
}

/** Returns all product IDs linked to a service as a Set. */
export function useServiceProductIds(serviceId: number | null) {
  const { data, ...rest } = useServiceProducts(serviceId);
  return { data: new Set((data || []).map((sp) => sp.product_id)), ...rest };
}

export function useCarWashProductMovements(productId: number | null) {
  return useQuery({
    queryKey: ["car_wash_stock_movements", productId],
    enabled: !!productId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select("*")
        .eq("product_id", productId!)
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data || [];
    },
  });
}

export function useLowStockCarWashProducts() {
  const { data: products } = useCarWashProducts();
  if (!products) return { outOfStock: [], lowStock: [] };
  const outOfStock = products.filter((p) => computeAvailableServices(p) <= 0);
  const lowStock = products.filter(
    (p) => computeAvailableServices(p) > 0 && p.stock_quantity <= p.min_stock_level
  );
  return { outOfStock, lowStock };
}

/** Call the DB RPC to check whether a service has enough inventory. */
export async function checkServiceInventory(serviceId: number): Promise<InventoryCheckResult> {
  const { data, error } = await (supabase.rpc as any)("check_service_inventory", {
    p_service_id: serviceId,
  });
  if (error) throw error;
  return data as InventoryCheckResult;
}

/** Call the DB RPC to record one use of a service against its products. */
export async function recordServiceInventory(serviceId: number, ticketId: number): Promise<void> {
  const { error } = await (supabase.rpc as any)("record_service_inventory", {
    p_service_id: serviceId,
    p_ticket_id: ticketId,
  });
  if (error) throw error;
}

/** Call the DB RPC to reverse inventory consumption when a ticket is deleted. */
export async function reverseServiceInventory(ticketId: number): Promise<void> {
  const { error } = await (supabase.rpc as any)("reverse_service_inventory", {
    p_ticket_id: ticketId,
  });
  if (error) throw error;
}

/** Mutation to save/replace the full list of products for a service. */
export function useSetServiceProducts() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      serviceId,
      productIds,
    }: {
      serviceId: number;
      productIds: number[];
    }) => {
      // Delete existing links for this service
      const { error: delErr } = await supabase
        .from("service_products")
        .delete()
        .eq("service_id", serviceId);
      if (delErr) throw delErr;

      if (productIds.length === 0) return;

      const rows = productIds.map((pid) => ({ service_id: serviceId, product_id: pid }));
      const { error: insErr } = await supabase.from("service_products").insert(rows);
      if (insErr) throw insErr;
    },
    onSuccess: (_data, { serviceId }) => {
      qc.invalidateQueries({ queryKey: ["service_products", serviceId] });
      qc.invalidateQueries({ queryKey: ["car_wash_products"] });
    },
  });
}
