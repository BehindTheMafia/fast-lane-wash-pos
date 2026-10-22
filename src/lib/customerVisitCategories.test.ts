import { describe, expect, it } from "vitest";
import { getLoyaltyEligibleVisitItems, getTicketVisitCategories, type TicketServiceItem } from "./customerVisitCategories";

const service = (name: string, is_extra = false): TicketServiceItem => ({
  item_type: "service",
  service_name_snapshot: name,
  services: { name, is_extra },
});

describe("getTicketVisitCategories", () => {
  it("separa Premium, Nítido y Breve aunque un ticket tenga varios servicios", () => {
    expect(getTicketVisitCategories([
      service("Lavado Premium"),
      service("Lavado Rápido – Nítido"),
      service("Lavado Rapido – Nitido"),
      service("Lavado Rápido – Breve"),
    ])).toEqual(["premium", "nitido", "breve"]);
  });

  it("no confunde un extra Premium ni un producto con una lavada Premium", () => {
    expect(getTicketVisitCategories([
      service("Pasteado Carrocería Premium", true),
      { item_type: "product", service_name_snapshot: "Lavado Premium", services: null },
      { item_type: "service", service_name_snapshot: "Pasteado Carrocería Premium", services: null },
    ])).toEqual([]);
  });

  it("usa el nombre guardado cuando el servicio del catálogo ya no existe", () => {
    expect(getTicketVisitCategories([
      { item_type: "service", service_name_snapshot: "Lavado Rápido – Breve", services: null },
    ])).toEqual(["breve"]);
  });

  it("Emigdio: cinco Breve no se suman a sus dos Premium y dos Nítido", () => {
    const tickets = [
      ...Array.from({ length: 2 }, () => [service("Servicio Premium")]),
      ...Array.from({ length: 2 }, () => [service("Lavado Rápido – Nítido")]),
      ...Array.from({ length: 5 }, () => [service("Lavado Rápido – Breve")]),
    ];
    const eligible = tickets.flatMap(getLoyaltyEligibleVisitItems);
    expect(eligible.filter(({ category }) => category === "premium")).toHaveLength(2);
    expect(eligible.filter(({ category }) => category === "nitido")).toHaveLength(2);
    expect(eligible).toHaveLength(4);
  });
});
