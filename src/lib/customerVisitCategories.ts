export type VisitCategory = "premium" | "nitido" | "breve";

export interface TicketServiceItem {
  service_id?: number | null;
  item_type: string | null;
  service_name_snapshot: string | null;
  services: { name: string; is_extra: boolean } | null;
}

const normalizeName = (name: string) =>
  name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Ticket categories shown in Reports, excluding products and extra services. */
export function getTicketVisitCategories(items: TicketServiceItem[]): VisitCategory[] {
  const categories = new Set<VisitCategory>();

  for (const item of items) {
    if ((item.item_type && item.item_type !== "service") || item.services?.is_extra) continue;

    const name = normalizeName(item.services?.name || item.service_name_snapshot || "");
    // A snapshot without a catalog entry needs to identify an actual wash.
    if (!item.services && !/\blavado\b/.test(name) && !/^(premium|nitido|breve)$/.test(name)) continue;

    if (/\bpremium\b/.test(name)) categories.add("premium");
    if (/\bnitido\b/.test(name)) categories.add("nitido");
    if (/\bbreve\b/.test(name)) categories.add("breve");
  }

  return [...categories];
}

/** Only Premium and Nítido washes advance a loyalty program; Breve has no program. */
export function getLoyaltyEligibleVisitItems(items: TicketServiceItem[]): Array<{ category: "premium" | "nitido"; item: TicketServiceItem }> {
  const eligible: Array<{ category: "premium" | "nitido"; item: TicketServiceItem }> = [];
  for (const item of items) {
    for (const category of getTicketVisitCategories([item])) {
      if (category !== "breve" && !eligible.some((entry) => entry.category === category)) {
        eligible.push({ category, item });
      }
    }
  }
  return eligible;
}
