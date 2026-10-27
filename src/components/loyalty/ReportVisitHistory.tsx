import type { LoyaltyTicket } from '@/lib/loyaltyFromTickets';
import { niFormatDate } from '@/utils/niDate';

/** One row per paid carwash ticket, including Breve and unclassified services. */
export default function ReportVisitHistory({ visits }: { visits: LoyaltyTicket[] }) {
  if (!visits.length) return <p className="py-8 text-center text-muted-foreground">Sin visitas de autolavado registradas.</p>;
  return <div className="overflow-x-auto rounded-xl border border-border bg-card">
    <table className="w-full text-sm">
      <thead className="bg-muted"><tr>
        <th className="p-3 text-left">Fecha</th><th className="p-3 text-left">Servicio</th><th className="p-3 text-left">Ticket</th>
      </tr></thead>
      <tbody>{visits.map(t => <tr key={t.id} className="border-t border-border">
        <td className="p-3">{niFormatDate(t.created_at)}</td>
        <td className="p-3">{t.ticket_items.filter(i => !i.item_type || i.item_type === 'service')
          .map(i => i.services?.name || i.service_name_snapshot || 'Servicio').join(', ') || 'Sin servicio registrado'}</td>
        <td className="p-3">{t.ticket_number}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}
