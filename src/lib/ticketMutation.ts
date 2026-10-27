import type { QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export async function invalidateTicketData(qc: QueryClient) {
  await Promise.all(['customer_loyalty', 'available_loyalty_rewards', 'customers', 'customer_visits',
    'memberships', 'products', 'car_wash_products', 'service_products', 'car_wash_stock_movements', 'low_stock_car_wash', 'loyalty_customer_search']
    .map(key => qc.invalidateQueries({ queryKey: [key] })));
  window.dispatchEvent(new Event('report-tickets-changed'));
}

export async function deleteReportTicket(ticketId: number) {
  const { data, error } = await (supabase as any).rpc('delete_report_ticket', { p_ticket_id: ticketId });
  if (error) throw error;
  if (!data?.success) throw new Error(data?.error || 'No se pudo eliminar el ticket');
}
