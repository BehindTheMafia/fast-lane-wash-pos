import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchReportRowsForIds } from '@/lib/fetchReportRows';
import { getTicketVisitCategories, type TicketServiceItem } from '@/lib/customerVisitCategories';

export function useCustomerVisits(customerIds: number[]) {
  return useQuery({
    queryKey: ['customer_visits', customerIds], enabled: customerIds.length > 0,
    staleTime: 0, refetchInterval: 60_000, refetchOnWindowFocus: 'always',
    queryFn: async () => {
      const rows = await fetchReportRowsForIds<{customer_id:number;created_at:string;ticket_items:TicketServiceItem[]}, number>(customerIds,
        (ids,from,to) => (supabase as any).from('tickets')
          .select('customer_id,created_at,ticket_items(service_id,item_type,service_name_snapshot,services(name,is_extra))')
          .in('customer_id',ids).eq('status','paid').eq('business_line','car_wash').order('id').range(from,to));
      const result = new Map<number,{total:number;premium:number;nitido:number;breve:number}>();
      for (const t of rows) {
        const v=result.get(t.customer_id)||{total:0,premium:0,nitido:0,breve:0};v.total++;
        getTicketVisitCategories(t.ticket_items).forEach(c=>v[c]++);result.set(t.customer_id,v);
      }
      return result;
    },
  });
}
