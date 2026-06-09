export type BusinessLine = "car_wash" | "barbershop";

export const BUSINESS_LINE_STORAGE_KEY = "fastlane_business_line";

export const BUSINESS_LINE_LABELS: Record<BusinessLine, string> = {
  car_wash: "Autolavado",
  barbershop: "Barbería",
};

export function isBusinessLine(value: string | null): value is BusinessLine {
  return value === "car_wash" || value === "barbershop";
}

export function parseBusinessLine(value: string | null): BusinessLine {
  return isBusinessLine(value) ? value : "car_wash";
}
