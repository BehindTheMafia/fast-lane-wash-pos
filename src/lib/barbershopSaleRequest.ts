export interface BarberCartItem {
  itemType: "service" | "product";
  serviceId?: number;
  productId?: number;
  name: string;
  price: number;
  quantity: number;
  discountPercent: number;
  maxStock?: number;
}

export interface BarberCustomer {
  id: number;
  name: string;
  plate: string;
  phone: string;
  is_general: boolean;
}

export interface BarberPayment {
  method: string;
  amount: number;
  currency: string;
  received: number;
  change: number;
  mixedPayments?: { method: string; amount: number; received: number; change: number }[];
}

export interface BarberSalePayload {
  customer_id: number | null;
  exchange_rate: number;
  items: {
    item_type: string;
    service_id: number | null;
    product_id: number | null;
    name: string;
    quantity: number;
    line_total: number;
  }[];
  payment: BarberPayment;
}

