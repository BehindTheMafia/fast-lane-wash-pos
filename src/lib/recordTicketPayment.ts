import type { SupabaseClient } from "@supabase/supabase-js";
import type { MixedPaymentPart } from "@/components/pos/PaymentModal";

export interface TicketPaymentData {
  currency: string;
  method: string;
  amount: number;
  received: number;
  change: number;
  mixedPayments?: MixedPaymentPart[];
}

export async function recordTicketPayment(
  supabase: SupabaseClient,
  ticketId: number,
  paymentData: TicketPaymentData,
  exchangeRate: number
): Promise<void> {
  if (paymentData.method === "mixed" && paymentData.mixedPayments?.length) {
    const { error: mixedPayErr } = await supabase.from("payments").insert({
      ticket_id: ticketId,
      amount: paymentData.amount,
      currency: paymentData.currency,
      payment_method: "mixed",
      amount_received: paymentData.received,
      change_amount: paymentData.change,
      exchange_rate: exchangeRate,
    } as any);

    if (mixedPayErr) {
      throw new Error(mixedPayErr.message || "No se pudo registrar el pago mixto");
    }

    for (const part of paymentData.mixedPayments) {
      const amountNio =
        paymentData.currency === "USD"
          ? Number((part.amount * exchangeRate).toFixed(2))
          : part.amount;
      const changeNio =
        paymentData.currency === "USD"
          ? Number((part.change * exchangeRate).toFixed(2))
          : part.change;
      const appliedNio = amountNio;

      const { error: partErr } = await (supabase as any).from("ticket_mixed_payments").insert({
        ticket_id: ticketId,
        method: part.method,
        currency: paymentData.currency,
        amount: part.amount,
        exchange_rate: exchangeRate,
        amount_nio: amountNio,
        applied_nio: appliedNio,
        change_nio: changeNio,
      });

      if (partErr) {
        throw new Error(partErr.message || "No se pudo guardar el desglose del pago mixto");
      }
    }
    return;
  }

  const { error: payErr } = await supabase.from("payments").insert({
    ticket_id: ticketId,
    amount: paymentData.amount,
    currency: paymentData.currency,
    payment_method: paymentData.method,
    amount_received: paymentData.received,
    change_amount: paymentData.change,
    exchange_rate: exchangeRate,
  } as any);

  if (payErr) {
    throw new Error(payErr.message || "No se pudo registrar el pago");
  }
}
