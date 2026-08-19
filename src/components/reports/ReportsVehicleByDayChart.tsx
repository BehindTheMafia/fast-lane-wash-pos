import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { VehicleByDayChartData } from "@/lib/reportsChartData";

const PALETTE = [
  "#2563EB", // Azul brillante (Sedán)
  "#10B981", // Verde esmeralda (Moto)
  "#F97316", // Naranja vibrante (Pick up)
  "#8B5CF6", // Púrpura (SUV)
  "#06B6D4", // Cyan (Camión 3T)
  "#EC4899", // Rosa / Magenta (Taxi)
  "#6366F1", // Indigo
  "#14B8A6", // Teal
  "#EAB308", // Ámbar dorado
  "#F43F5E", // Rose
  "#84CC16", // Lime
  "#64748B", // Slate
];

function getVehicleIcon(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("moto")) return "fa-solid fa-motorcycle";
  if (l.includes("pick") || l.includes("camioneta")) return "fa-solid fa-truck-pickup";
  if (l.includes("suv")) return "fa-solid fa-car-side";
  if (l.includes("camion") || l.includes("camión")) return "fa-solid fa-truck";
  if (l.includes("taxi")) return "fa-solid fa-taxi";
  if (l.includes("sedan") || l.includes("sedán") || l.includes("auto") || l.includes("carro")) return "fa-solid fa-car";
  return "fa-solid fa-car";
}

interface Props {
  data: VehicleByDayChartData;
}

type ViewMode = "stacked" | "trend" | "distribution";

export default function ReportsVehicleByDayChart({ data }: Props) {
  // Filter out any "otros" from vehicleTypes if present
  const vehicleTypes = useMemo(
    () =>
      (data.vehicleTypes || []).filter(
        (vt) =>
          vt.slug.toLowerCase() !== "otros" &&
          vt.label.toLowerCase() !== "otros" &&
          vt.label.toLowerCase() !== "n/a",
      ),
    [data.vehicleTypes],
  );

  const rows = data.rows || [];
  const [viewMode, setViewMode] = useState<ViewMode>("stacked");
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);
  const [activePieIndex, setActivePieIndex] = useState<number | null>(null);

  // Assign colors to vehicle types
  const vehicleConfigMap = useMemo(() => {
    const map = new Map<string, { label: string; color: string; icon: string; index: number }>();
    vehicleTypes.forEach((vt, index) => {
      map.set(vt.slug, {
        label: vt.label,
        color: PALETTE[index % PALETTE.length],
        icon: getVehicleIcon(vt.label),
        index,
      });
    });
    return map;
  }, [vehicleTypes]);

  // Overall totals and stats per vehicle
  const { totalVisits, vehicleStats, busiestDay, topVehicle, dailyAverage } = useMemo(() => {
    let globalTotal = 0;
    let maxDayTotal = 0;
    let maxDayLabel = "";
    let maxDayKey = "";

    // Calculate per-day totals and find busiest day
    rows.forEach((row) => {
      let dayTotal = 0;
      vehicleTypes.forEach((vt) => {
        const count = Number(row[vt.slug]) || 0;
        dayTotal += count;
      });
      globalTotal += dayTotal;
      if (dayTotal > maxDayTotal) {
        maxDayTotal = dayTotal;
        maxDayLabel = row.label;
        maxDayKey = row.dayKey;
      }
    });

    // Calculate stats for each vehicle type
    const stats = vehicleTypes.map((vt) => {
      const config = vehicleConfigMap.get(vt.slug) || {
        label: vt.label,
        color: PALETTE[0],
        icon: "fa-solid fa-car",
        index: 0,
      };

      let vtTotal = 0;
      let vtMaxCount = 0;
      let vtMaxDay = "";

      rows.forEach((row) => {
        const count = Number(row[vt.slug]) || 0;
        vtTotal += count;
        if (count > vtMaxCount) {
          vtMaxCount = count;
          vtMaxDay = row.label;
        }
      });

      const percentage = globalTotal > 0 ? (vtTotal / globalTotal) * 100 : 0;
      const dailyAvg = rows.length > 0 ? (vtTotal / rows.length).toFixed(1) : "0";

      return {
        slug: vt.slug,
        label: vt.label,
        color: config.color,
        icon: config.icon,
        total: vtTotal,
        percentage,
        dailyAvg,
        peakDay: {
          label: vtMaxDay || "—",
          count: vtMaxCount,
        },
      };
    });

    // Sort stats descending by total visits
    stats.sort((a, b) => b.total - a.total);

    // Filter out items with 0 total visits to keep UI clean
    const activeStats = stats.filter((s) => s.total > 0);

    const top = activeStats.length > 0 ? activeStats[0] : null;
    const avgDaily = rows.length > 0 ? (globalTotal / rows.length).toFixed(1) : "0";

    return {
      totalVisits: globalTotal,
      vehicleStats: activeStats,
      busiestDay: {
        total: maxDayTotal,
        label: maxDayLabel || "—",
        dayKey: maxDayKey,
      },
      topVehicle: top,
      dailyAverage: avgDaily,
    };
  }, [rows, vehicleTypes, vehicleConfigMap]);

  // Donut data formatted for Recharts Pie
  const donutData = useMemo(() => {
    return vehicleStats.map((s) => ({
      name: s.label,
      value: s.total,
      slug: s.slug,
      color: s.color,
      percentage: s.percentage,
    }));
  }, [vehicleStats]);

  // Data check
  const hasVisits = totalVisits > 0;

  if (rows.length === 0 || vehicleTypes.length === 0 || !hasVisits) {
    return (
      <div className="flex flex-col items-center justify-center h-[280px] rounded-xl border border-dashed border-border/60 bg-muted/20 text-muted-foreground p-6 text-center">
        <i className="fa-solid fa-car-tunnel text-4xl mb-3 opacity-30 text-secondary" />
        <p className="text-sm font-medium text-foreground">Sin registros de vehículos</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-xs">
          No se encontraron visitas de vehículos en el rango de fechas seleccionado.
        </p>
      </div>
    );
  }

  // Determine if horizontal scroll is needed for long date ranges
  const isLargeDateRange = rows.length > 14;
  const isExtremeDateRange = rows.length > 30;
  const chartScrollWidth = isLargeDateRange ? `${Math.max(rows.length * 36, 540)}px` : "100%";

  // Determine active visible vehicle types based on filter
  const visibleVehicleTypes = selectedVehicle
    ? vehicleTypes.filter((vt) => vt.slug === selectedVehicle)
    : vehicleTypes.filter((vt) => vehicleStats.some((s) => s.slug === vt.slug));

  const activeVehicleStat = selectedVehicle
    ? vehicleStats.find((s) => s.slug === selectedVehicle)
    : null;

  // Custom Rich Tooltip Component
  const CustomBarTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;

    const rowData = payload[0]?.payload;
    let dayTotal = 0;
    vehicleTypes.forEach((vt) => {
      dayTotal += Number(rowData?.[vt.slug]) || 0;
    });

    const activeItems = payload
      .map((p: any) => {
        const config = vehicleConfigMap.get(p.dataKey);
        const value = Number(p.value) || 0;
        return {
          slug: p.dataKey,
          label: config?.label || p.name,
          color: config?.color || p.color,
          icon: config?.icon || "fa-solid fa-car",
          value,
        };
      })
      .filter((item: any) => item.value > 0)
      .sort((a: any, b: any) => b.value - a.value);

    return (
      <div className="bg-popover/95 backdrop-blur-md border border-border rounded-xl p-3 shadow-2xl text-xs space-y-2 min-w-[200px] max-w-[260px] z-50">
        <div className="flex items-center justify-between border-b border-border/60 pb-1.5 gap-2">
          <span className="font-bold text-foreground flex items-center gap-1.5 truncate">
            <i className="fa-regular fa-calendar-check text-secondary shrink-0" />
            {rowData?.label || label}
          </span>
          <span className="bg-primary/10 text-primary font-bold px-2 py-0.5 rounded-full text-[11px] shrink-0">
            {dayTotal} {dayTotal === 1 ? "vehículo" : "vehículos"}
          </span>
        </div>

        {activeItems.length === 0 ? (
          <p className="text-muted-foreground text-[11px] italic py-1">Sin vehículos registrados</p>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {activeItems.map((item: any) => {
              const pct = dayTotal > 0 ? ((item.value / dayTotal) * 100).toFixed(0) : "0";
              const isHighlighted = selectedVehicle === item.slug;
              return (
                <div
                  key={item.slug}
                  className={`flex items-center justify-between gap-2 px-1.5 py-1 rounded-md transition-colors ${
                    isHighlighted ? "bg-muted/60 font-semibold" : "text-foreground"
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0 truncate">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="truncate text-foreground font-medium">{item.label}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 tabular-nums">
                    <span className="font-bold text-foreground">{item.value}</span>
                    <span className="text-muted-foreground text-[10px]">({pct}%)</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col justify-between space-y-4">
      {/* ── 1. KPI Quick Summary Badges (2x2 on mobile, 4x1 on desktop) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-background/60 border border-border/60 rounded-xl p-2.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground text-[11px] mb-1">
            <span>Total Visitas</span>
            <i className="fa-solid fa-car text-secondary text-xs" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg sm:text-xl font-bold text-foreground tabular-nums">
              {totalVisits}
            </span>
            <span className="text-[10px] text-muted-foreground font-medium">
              en {rows.length} {rows.length === 1 ? "día" : "días"}
            </span>
          </div>
        </div>

        <div className="bg-background/60 border border-border/60 rounded-xl p-2.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground text-[11px] mb-1">
            <span>Más Frecuente</span>
            <i className="fa-solid fa-trophy text-amber-500 text-xs" />
          </div>
          {topVehicle ? (
            <div className="flex flex-col min-w-0">
              <span className="text-xs sm:text-sm font-bold text-foreground truncate">
                {topVehicle.label}
              </span>
              <span className="text-[10px] text-muted-foreground font-medium tabular-nums">
                {topVehicle.total} ({topVehicle.percentage.toFixed(0)}%)
              </span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>

        <div className="bg-background/60 border border-border/60 rounded-xl p-2.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground text-[11px] mb-1">
            <span>Día Récord</span>
            <i className="fa-solid fa-fire text-orange-500 text-xs" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs sm:text-sm font-bold text-foreground truncate">
              {busiestDay.label}
            </span>
            <span className="text-[10px] text-muted-foreground font-medium tabular-nums">
              {busiestDay.total} {busiestDay.total === 1 ? "visita" : "visitas"}
            </span>
          </div>
        </div>

        <div className="bg-background/60 border border-border/60 rounded-xl p-2.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground text-[11px] mb-1">
            <span>Promedio Diario</span>
            <i className="fa-solid fa-gauge-high text-blue-500 text-xs" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg sm:text-xl font-bold text-foreground tabular-nums">
              {dailyAverage}
            </span>
            <span className="text-[10px] text-muted-foreground font-medium">veh/día</span>
          </div>
        </div>
      </div>

      {/* ── 2. View Mode Switcher (Symmetrical 3-column segmented tabs) ── */}
      <div className="grid grid-cols-3 gap-1 p-1 bg-muted/40 rounded-xl border border-border/60 w-full">
        <button
          type="button"
          onClick={() => setViewMode("stacked")}
          className={`py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            viewMode === "stacked"
              ? "bg-card text-foreground shadow-sm font-bold"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <i className="fa-solid fa-chart-column text-[11px]" />
          <span>Barras</span>
        </button>
        <button
          type="button"
          onClick={() => setViewMode("trend")}
          className={`py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            viewMode === "trend"
              ? "bg-card text-foreground shadow-sm font-bold"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <i className="fa-solid fa-chart-line text-[11px]" />
          <span>Tendencia</span>
        </button>
        <button
          type="button"
          onClick={() => setViewMode("distribution")}
          className={`py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            viewMode === "distribution"
              ? "bg-card text-foreground shadow-sm font-bold"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <i className="fa-solid fa-chart-pie text-[11px]" />
          <span>Distribución</span>
        </button>
      </div>

      {/* ── 3. Symmetrical Legend & Vehicle Filter System ── */}
      <div className="space-y-2">
        {/* Full-width Symmetrical "Todos" Reset Button */}
        <button
          type="button"
          onClick={() => setSelectedVehicle(null)}
          className={`w-full px-3 py-2 rounded-xl text-xs transition-all flex items-center justify-between border ${
            selectedVehicle === null
              ? "bg-primary text-primary-foreground font-bold shadow-sm border-primary ring-1 ring-primary/40"
              : "bg-background/70 hover:bg-muted/60 text-muted-foreground border-border/60"
          }`}
        >
          <span className="flex items-center gap-2">
            <i className="fa-solid fa-layer-group text-xs" />
            <span>Todos los Vehículos</span>
          </span>
          <span className="tabular-nums font-semibold text-[11px] opacity-90">
            {totalVisits} visitas · 100%
          </span>
        </button>

        {/* Symmetrical 2-column (mobile) or 3-column (tablet/desktop) Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {vehicleStats.map((vt) => {
            const isSelected = selectedVehicle === vt.slug;
            return (
              <button
                key={vt.slug}
                type="button"
                onClick={() => setSelectedVehicle(isSelected ? null : vt.slug)}
                className={`p-2.5 rounded-xl text-xs transition-all flex items-center justify-between gap-2 border text-left min-h-[44px] ${
                  isSelected
                    ? "font-bold shadow-sm border-foreground/40 bg-muted/90 text-foreground ring-2 ring-primary/30 scale-[1.02]"
                    : "bg-background/70 hover:bg-muted/50 text-foreground border-border/60"
                }`}
                style={{
                  borderColor: isSelected ? vt.color : undefined,
                }}
              >
                <div className="flex items-center gap-2 min-w-0 truncate">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                    style={{ backgroundColor: vt.color }}
                  />
                  <span className="truncate font-semibold text-foreground">
                    {vt.label}
                  </span>
                </div>
                <div className="text-right shrink-0 tabular-nums">
                  <span className="font-bold text-foreground">{vt.total}</span>
                  <span className="text-muted-foreground text-[10px] ml-1">
                    {vt.percentage.toFixed(0)}%
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 4. Main Chart Canvas Area ── */}
      {viewMode === "distribution" ? (
        /* ── VISTA 3: DISTRIBUCIÓN & RANKING (DONUT + LEADERBOARD) ── */
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center bg-card/40 rounded-xl border border-border/50 p-4">
          {/* Donut Chart */}
          <div className="md:col-span-5 flex flex-col items-center justify-center relative">
            <div className="relative w-[180px] h-[180px] sm:w-[210px] sm:h-[210px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                    strokeWidth={1}
                    stroke="var(--card)"
                    onMouseEnter={(_, index) => setActivePieIndex(index)}
                    onMouseLeave={() => setActivePieIndex(null)}
                    onClick={(entry) => setSelectedVehicle(selectedVehicle === entry.slug ? null : entry.slug)}
                    cursor="pointer"
                  >
                    {donutData.map((entry, index) => {
                      const isHighlighted =
                        selectedVehicle === entry.slug || activePieIndex === index;
                      const isDimmed =
                        (selectedVehicle && selectedVehicle !== entry.slug) ||
                        (activePieIndex !== null && activePieIndex !== index);
                      return (
                        <Cell
                          key={entry.slug}
                          fill={entry.color}
                          opacity={isDimmed ? 0.35 : 1}
                          stroke={isHighlighted ? "#fff" : "transparent"}
                          strokeWidth={isHighlighted ? 2 : 0}
                        />
                      );
                    })}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const item = payload[0].payload;
                      return (
                        <div className="bg-popover border border-border rounded-xl px-3 py-2 shadow-xl text-xs">
                          <div className="flex items-center gap-1.5 font-bold text-foreground">
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: item.color }}
                            />
                            {item.name}
                          </div>
                          <p className="text-muted-foreground mt-0.5 text-[11px] tabular-nums">
                            {item.value} visitas ({item.percentage.toFixed(1)}% del total)
                          </p>
                        </div>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>

              {/* Center Donut Label */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl sm:text-3xl font-black text-foreground tabular-nums leading-none tracking-tight">
                  {totalVisits}
                </span>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-1">
                  Visitas
                </span>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground text-center mt-1">
              Toca una sección para filtrar
            </p>
          </div>

          {/* Ranked Vehicle Leaderboard */}
          <div className="md:col-span-7 space-y-2.5">
            <h4 className="text-xs font-bold text-foreground uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>Ranking por Tipo de Vehículo</span>
              <span className="text-muted-foreground font-normal text-[10px]">
                {vehicleStats.length} categorías
              </span>
            </h4>

            <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
              {vehicleStats.map((vt, index) => {
                const isSelected = selectedVehicle === vt.slug;
                return (
                  <div
                    key={vt.slug}
                    onClick={() => setSelectedVehicle(isSelected ? null : vt.slug)}
                    className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? "bg-primary/10 border-primary shadow-sm"
                        : "bg-background/60 hover:bg-muted/50 border-border/60"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-bold text-muted-foreground w-4 text-center">
                          #{index + 1}
                        </span>
                        <span
                          className="w-3 h-3 rounded-full shrink-0 shadow-sm"
                          style={{ backgroundColor: vt.color }}
                        />
                        <i className={`${vt.icon} text-xs text-muted-foreground shrink-0`} />
                        <span className="text-xs font-bold text-foreground truncate">
                          {vt.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 tabular-nums">
                        <span className="text-xs font-bold text-foreground">
                          {vt.total} {vt.total === 1 ? "visita" : "visitas"}
                        </span>
                        <span className="text-[10px] font-semibold bg-muted px-1.5 py-0.5 rounded-md text-foreground">
                          {vt.percentage.toFixed(1)}%
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full h-1.5 bg-muted/60 rounded-full overflow-hidden mb-1">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${vt.percentage}%`,
                          backgroundColor: vt.color,
                        }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>
                        <i className="fa-solid fa-arrow-trend-up mr-1 text-secondary" />
                        Récord: {vt.peakDay.label} ({vt.peakDay.count})
                      </span>
                      <span>Prom: {vt.dailyAvg} /día</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* ── VISTA 1 & 2: BARRAS APILADAS O TENDENCIA EN EL TIEMPO ── */
        <div className="space-y-1.5">
          {/* Helper hint for long ranges on mobile */}
          {isLargeDateRange && (
            <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
              <span className="flex items-center gap-1 text-secondary font-medium">
                <i className="fa-solid fa-arrows-left-right text-[10px]" />
                Período amplio ({rows.length} días)
              </span>
              <span className="text-[10px] opacity-75 sm:hidden">
                Desliza para ver más fechas ➔
              </span>
            </div>
          )}

          {/* Scrollable container for mobile / long ranges */}
          <div className="overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin scrollbar-thumb-muted-foreground/20">
            <div
              style={{
                width: isLargeDateRange ? chartScrollWidth : "100%",
                minWidth: "100%",
                height: 310,
              }}
            >
              <ResponsiveContainer width="100%" height="100%">
                {viewMode === "stacked" ? (
                  <BarChart
                    data={rows}
                    margin={{
                      left: -12,
                      right: 12,
                      top: 16,
                      bottom: isLargeDateRange ? 16 : 4,
                    }}
                  >
                    <CartesianGrid
                      vertical={false}
                      strokeDasharray="3 3"
                      stroke="currentColor"
                      className="text-border/40"
                    />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      interval={isExtremeDateRange ? 2 : 0}
                      minTickGap={20}
                      tick={{
                        fontSize: isLargeDateRange ? 10 : 11,
                        fill: "currentColor",
                        className: "text-muted-foreground",
                      }}
                      height={isLargeDateRange ? 40 : 28}
                      angle={isLargeDateRange ? -35 : 0}
                      textAnchor={isLargeDateRange ? "end" : "middle"}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      tickMargin={4}
                      width={36}
                      tick={{
                        fontSize: 10,
                        fill: "currentColor",
                        className: "text-muted-foreground",
                      }}
                    />
                    <Tooltip
                      content={<CustomBarTooltip />}
                      cursor={{ fill: "currentColor", opacity: 0.08 }}
                    />

                    {/* If a single vehicle is selected, render single clean bar */}
                    {selectedVehicle ? (
                      <Bar
                        dataKey={selectedVehicle}
                        name={activeVehicleStat?.label || selectedVehicle}
                        fill={activeVehicleStat?.color || PALETTE[0]}
                        radius={[6, 6, 0, 0]}
                        maxBarSize={44}
                      />
                    ) : (
                      /* Stacked Bars for all visible vehicle types */
                      visibleVehicleTypes.map((vt, i) => {
                        const config = vehicleConfigMap.get(vt.slug);
                        const isTop = i === visibleVehicleTypes.length - 1;
                        return (
                          <Bar
                            key={vt.slug}
                            dataKey={vt.slug}
                            name={config?.label || vt.label}
                            stackId="vehicles"
                            fill={config?.color || PALETTE[i % PALETTE.length]}
                            radius={isTop ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                            maxBarSize={38}
                          />
                        );
                      })
                    )}
                  </BarChart>
                ) : (
                  /* Trend Line / Area View */
                  <AreaChart
                    data={rows}
                    margin={{
                      left: -12,
                      right: 12,
                      top: 16,
                      bottom: isLargeDateRange ? 16 : 4,
                    }}
                  >
                    <CartesianGrid
                      vertical={false}
                      strokeDasharray="3 3"
                      stroke="currentColor"
                      className="text-border/40"
                    />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      interval={isExtremeDateRange ? 2 : 0}
                      minTickGap={20}
                      tick={{
                        fontSize: isLargeDateRange ? 10 : 11,
                        fill: "currentColor",
                        className: "text-muted-foreground",
                      }}
                      height={isLargeDateRange ? 40 : 28}
                      angle={isLargeDateRange ? -35 : 0}
                      textAnchor={isLargeDateRange ? "end" : "middle"}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      tickMargin={4}
                      width={36}
                      tick={{
                        fontSize: 10,
                        fill: "currentColor",
                        className: "text-muted-foreground",
                      }}
                    />
                    <Tooltip content={<CustomBarTooltip />} />

                    {visibleVehicleTypes.map((vt, i) => {
                      const config = vehicleConfigMap.get(vt.slug);
                      const color = config?.color || PALETTE[i % PALETTE.length];
                      return (
                        <Area
                          key={vt.slug}
                          type="monotone"
                          dataKey={vt.slug}
                          name={config?.label || vt.label}
                          stroke={color}
                          fill={color}
                          fillOpacity={selectedVehicle ? 0.25 : 0.12}
                          strokeWidth={selectedVehicle ? 3 : 2}
                          dot={rows.length <= 14 ? { r: 3, fill: color } : false}
                          activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }}
                        />
                      );
                    })}
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ── 5. Key Highlights / Record Insights Footer (Symmetrical 2-column / 3-column Grid) ── */}
      <div className="pt-2 border-t border-border/50">
        <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <i className="fa-solid fa-lightbulb text-amber-500" />
          Récords y Máximos del Período
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {vehicleStats.map((vt) => (
            <div
              key={vt.slug}
              onClick={() =>
                setSelectedVehicle(selectedVehicle === vt.slug ? null : vt.slug)
              }
              className={`flex flex-col justify-between p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                selectedVehicle === vt.slug
                  ? "bg-primary/10 border-primary font-semibold shadow-sm"
                  : "bg-background/50 hover:bg-muted/40 border-border/50"
              }`}
            >
              <div className="flex items-center gap-1.5 min-w-0 mb-1">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: vt.color }}
                />
                <span className="font-semibold text-foreground truncate">{vt.label}</span>
              </div>
              <div className="flex items-baseline justify-between gap-1 text-[11px]">
                <span className="text-foreground font-bold tabular-nums">
                  {vt.peakDay.count} máx
                </span>
                <span className="text-[10px] text-muted-foreground truncate">
                  {vt.peakDay.label}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
