import { eachDayOfInterval, parseISO } from "date-fns";
import { niFormatDate, niFormatTime24, niFormatTimeExact } from "@/utils/niDate";

const NI_TZ = "America/Managua";
const VEHICLE_BY_DAY_TOP_N = 6;

export type SalesTrendPoint = {
  key: string;
  label: string;
  exactTime: string;
  total: number;
  tickets: number;
};

export type VehicleByDayRow = {
  dayKey: string;
  label: string;
  [vehicleSlug: string]: string | number;
};

export type VehicleByDayChartData = {
  rows: VehicleByDayRow[];
  vehicleTypes: { slug: string; label: string }[];
};

type Bucket = {
  total: number;
  tickets: number;
  firstAt: string;
};

function slugifyVehicle(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return slug || "vehiculo";
}

function niDateKey(iso: string | Date): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: NI_TZ });
}

function niMinuteKey(iso: string | Date): string {
  const d = new Date(iso);
  const date = niDateKey(d);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: NI_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${date} ${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

type TicketLike = { created_at: string; total: number | string };

type TicketWithVehicle = {
  created_at: string;
  vehicle_types?: { name?: string } | null;
};

function dayAxisLabel(dayKey: string): string {
  const sample = new Date(`${dayKey}T12:00:00-06:00`);
  const weekday = sample.toLocaleDateString("es-NI", {
    timeZone: NI_TZ,
    weekday: "short",
  });
  const date = niFormatDate(sample, { day: "2-digit", month: "2-digit" });
  return `${weekday} ${date}`;
}

export function buildSalesTrendData(
  tickets: TicketLike[],
  dateFrom: string,
  dateTo: string,
): SalesTrendPoint[] {
  const singleDay = dateFrom === dateTo;

  if (singleDay) {
    const buckets = new Map<string, Bucket>();

    tickets.forEach((t) => {
      const key = niMinuteKey(t.created_at);
      if (!buckets.has(key)) {
        buckets.set(key, { total: 0, tickets: 0, firstAt: t.created_at });
      }
      const b = buckets.get(key)!;
      if (new Date(t.created_at).getTime() < new Date(b.firstAt).getTime()) {
        b.firstAt = t.created_at;
      }
      b.total += Number(t.total);
      b.tickets += 1;
    });

    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, { total, tickets: count, firstAt }]) => ({
        key,
        label: niFormatTime24(firstAt),
        exactTime: niFormatTimeExact(firstAt),
        total: +total.toFixed(2),
        tickets: count,
      }));
  }

  const days = eachDayOfInterval({
    start: parseISO(dateFrom),
    end: parseISO(dateTo),
  });

  const buckets = new Map<string, Bucket>();
  days.forEach((d) => {
    const key = d.toLocaleDateString("en-CA", { timeZone: NI_TZ });
    buckets.set(key, { total: 0, tickets: 0, firstAt: `${key}T12:00:00-06:00` });
  });

  tickets.forEach((t) => {
    const key = niDateKey(t.created_at);
    if (!buckets.has(key)) {
      buckets.set(key, { total: 0, tickets: 0, firstAt: t.created_at });
    }
    const b = buckets.get(key)!;
    b.total += Number(t.total);
    b.tickets += 1;
  });

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, { total, tickets: count, firstAt }]) => {
      const sample = new Date(firstAt.includes("T") ? firstAt : `${key}T12:00:00-06:00`);
      const dateLabel = niFormatDate(sample, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
      return {
        key,
        label: niFormatDate(sample, { day: "2-digit", month: "2-digit" }),
        exactTime: dateLabel,
        total: +total.toFixed(2),
        tickets: count,
      };
    });
}

export function buildVehicleVisitsByDayData(
  tickets: TicketWithVehicle[],
  dateFrom: string,
  dateTo: string,
): VehicleByDayChartData {
  const days = eachDayOfInterval({
    start: parseISO(dateFrom),
    end: parseISO(dateTo),
  });

  const dayKeys = days.map((d) => d.toLocaleDateString("en-CA", { timeZone: NI_TZ }));
  const dayKeySet = new Set(dayKeys);

  const totalsByName = new Map<string, number>();
  const countsByDay = new Map<string, Map<string, number>>();

  dayKeys.forEach((key) => countsByDay.set(key, new Map()));

  tickets.forEach((t) => {
    const dayKey = niDateKey(t.created_at);
    if (!dayKeySet.has(dayKey)) return;

    const vehicleName = t.vehicle_types?.name || "N/A";
    totalsByName.set(vehicleName, (totalsByName.get(vehicleName) || 0) + 1);

    const dayMap = countsByDay.get(dayKey)!;
    dayMap.set(vehicleName, (dayMap.get(vehicleName) || 0) + 1);
  });

  const sortedNames = Array.from(totalsByName.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);

  const topNames = new Set(sortedNames.slice(0, VEHICLE_BY_DAY_TOP_N));
  const hasOthers = sortedNames.length > VEHICLE_BY_DAY_TOP_N;

  const vehicleTypes: { slug: string; label: string }[] = sortedNames
    .slice(0, VEHICLE_BY_DAY_TOP_N)
    .map((name) => ({ slug: slugifyVehicle(name), label: name }));

  const usedSlugs = new Set<string>();
  vehicleTypes.forEach((vt) => {
    let slug = vt.slug;
    let n = 1;
    while (usedSlugs.has(slug)) {
      slug = `${vt.slug}_${n++}`;
    }
    vt.slug = slug;
    usedSlugs.add(slug);
  });

  if (hasOthers) {
    vehicleTypes.push({ slug: "otros", label: "Otros" });
  }

  const nameToSlug = (name: string): string => {
    if (!topNames.has(name)) return "otros";
    const found = vehicleTypes.find((v) => v.label === name);
    return found?.slug ?? "otros";
  };

  const rows: VehicleByDayRow[] = dayKeys.map((dayKey) => {
    const row: VehicleByDayRow = {
      dayKey,
      label: dayAxisLabel(dayKey),
    };
    vehicleTypes.forEach((vt) => {
      row[vt.slug] = 0;
    });

    const dayMap = countsByDay.get(dayKey);
    if (dayMap) {
      dayMap.forEach((count, vehicleName) => {
        const slug = nameToSlug(vehicleName);
        row[slug] = (Number(row[slug]) || 0) + count;
      });
    }

    return row;
  });

  return { rows, vehicleTypes };
}
