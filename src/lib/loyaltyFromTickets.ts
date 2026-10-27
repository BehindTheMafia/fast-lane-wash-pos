import { getLoyaltyEligibleVisitItems, getTicketVisitCategories, type TicketServiceItem } from './customerVisitCategories';
import type { CustomerLoyaltySummary, LoyaltyProgram, LoyaltyReward, LoyaltyRedemption, LoyaltyWashLog } from '@/hooks/useLoyaltyV3';

export interface LoyaltyTicket {
  id: number;
  customer_id: number;
  status: string;
  business_line: string;
  created_at: string;
  ticket_number: string;
  ticket_items: TicketServiceItem[];
}

/** Same entitlement rule as get_public_loyalty_card. Consumed/expired groups
 * still occupy their place, so deleting a visit cannot recycle a used benefit. */
export function eligibleRewardIds(rewards: LoyaltyReward[], program: LoyaltyProgram, total: number): Set<number> {
  const eligible = new Set<number>();
  for (const milestone of program.rewards) {
    const groups = new Map<string, LoyaltyReward[]>();
    for (const reward of rewards.filter(r => r.program_id === program.id)) {
      if (reward.reward_slug !== milestone.reward_slug && !milestone.options?.some(o => o.reward_slug === reward.reward_slug)) continue;
      const key = reward.option_group || `reward:${reward.id}`;
      groups.set(key, [...(groups.get(key) || []), reward]);
    }
    const ordered = [...groups.values()].sort((a, b) => {
      const earliest = (g: LoyaltyReward[]) => Math.min(...g.map(r => Date.parse(r.earned_at)));
      return earliest(a) - earliest(b) || Math.min(...a.map(r => r.id)) - Math.min(...b.map(r => r.id));
    });
    const allowed = Math.floor(total / program.cycle_size) + (total % program.cycle_size >= milestone.at ? 1 : 0);
    ordered.slice(0, allowed).forEach(group => group.forEach(r => eligible.add(r.id)));
  }
  return eligible;
}

export function loyaltyFromTickets(customerId: number, tickets: LoyaltyTicket[], programs: LoyaltyProgram[], rewards: LoyaltyReward[], redemptions: LoyaltyRedemption[] = [], now = Date.now()): CustomerLoyaltySummary {
  const paid = tickets.filter(t => t.customer_id === customerId && t.status === 'paid' && t.business_line === 'car_wash')
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id - b.id);
  const active = programs.filter(p => p.active && ['premium', 'nitido'].includes(p.slug));
  const totals = new Map<number, number>();
  const washLog: LoyaltyWashLog[] = [];
  const categories = { premium: 0, nitido: 0, breve: 0 };
  for (const ticket of paid) {
    getTicketVisitCategories(ticket.ticket_items).forEach(c => categories[c]++);
    for (const { category, item } of getLoyaltyEligibleVisitItems(ticket.ticket_items)) {
      const program = active.find(p => p.slug === category);
      if (!program) continue;
      const total = (totals.get(program.id) || 0) + 1;
      totals.set(program.id, total);
      washLog.push({ id: -(ticket.id * 10 + program.id), customer_id: customerId, program_id: program.id,
        ticket_id: ticket.id, service_id: item.service_id ?? null, wash_number: ((total - 1) % program.cycle_size) + 1,
        reward_earned_id: rewards.find(r => r.ticket_id === ticket.id && r.program_id === program.id)?.id ?? null,
        loyalty_rewards: rewards.find(r => r.ticket_id === ticket.id && r.program_id === program.id) ?? null, created_at: ticket.created_at, user_id: null, loyalty_programs: program,
        tickets: ticket, services: { name: item.services?.name || item.service_name_snapshot || program.name } });
    }
  }
  const validPairs = new Set(washLog.map(w => `${w.ticket_id}:${w.program_id}`));
  const ids = new Set(active.flatMap(p => [...eligibleRewardIds(rewards, p, totals.get(p.id) || 0)]));
  return {
    visits: [...paid].reverse(), totalVisits: paid.length, lastVisit: paid.at(-1)?.created_at ?? null, categories,
    progress: active.map(p => {
      const total = totals.get(p.id) || 0;
      return { id: p.id, customer_id: customerId, program_id: p.id, total_washes: total,
        washes_in_cycle: total % p.cycle_size, cycle_number: Math.floor(total / p.cycle_size),
        updated_at: paid.at(-1)?.created_at || '', loyalty_programs: p };
    }),
    rewards: rewards.filter(r => r.customer_id === customerId && (r.status !== 'available' || (
      ids.has(r.id) && validPairs.has(`${r.ticket_id}:${r.program_id}`) && (!r.expires_at || Date.parse(r.expires_at) > now)
    ))),
    washLog: washLog.reverse(), redemptions,
  };
}
