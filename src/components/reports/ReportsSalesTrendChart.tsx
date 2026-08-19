import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SalesTrendPoint } from "@/lib/reportsChartData";

interface Props {
  data: SalesTrendPoint[];
  granularity: "minute" | "day";
}

type ViewMode = "amount" | "tickets" | "average";

export default function ReportsSalesTrendChart({ data, granularity }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("amount");
  const [selectedFilter, setSelectedFilter] = useState<string | null>(null);

  const {
    totalSales,
    totalTickets,
    avgTicketValue,
    bestSalesPoint,
    bestTicketPoint,
    dailySalesAvg,
    highSalesDays,
    medSalesDays,
    lowSalesDays,
  } = useMemo(() => {
    let salesSum = 0;
    let ticketSum = 0;
    let maxSales = 0;
    let bestSales: SalesTrendPoint | null = null;
    let maxTickets = 0;
    let bestTicket: SalesTrendPoint | null = null;

    let highDays = 0;
    let medDays = 0;
    let lowDays = 0;

    data.forEach((pt) => {
      salesSum += pt.total;
      ticketSum += pt.tickets;
      if (pt.total > maxSales) {
        maxSales = pt.total;
        bestSales = pt;
      }
      if (pt.tickets > maxTickets) {
        maxTickets = pt.tickets;
        bestTicket = pt;
      }

      if (pt.total >= 5000) highDays++;
      else if (pt.total >= 2000) medDays++;
      else lowDays++;
    });

    const avgVal = ticketSum > 0 ? salesSum / ticketSum : 0;
    const dailyAvg = data.length > 0 ? salesSum / data.length : 0;

    return {
      totalSales: salesSum,
      totalTickets: ticketSum,
      avgTicketValue: avgVal,
      bestSalesPoint: bestSales || data[0] || { label: "—", exactTime: "—", total: 0, tickets: 0 },
      bestTicketPoint: bestTicket || data[0] || { label: "—", exactTime: "—", total: 0, tickets: 0 },
      dailySalesAvg: dailyAvg,
      highSalesDays: highDays,
      medSalesDays: medDays,
      lowSalesDays: lowDays,
    };
  }, [data]);

  // Enhanced data array with calculated average per point
  const chartData = useMemo(() => {
    return data.map((pt) => ({
      ...pt,
      avgTicket: pt.tickets > 0 ? +(pt.total / pt.tickets).toFixed(2) : 0,
    }));
  }, [data]);

  const hasData = totalSales > 0 || totalTickets > 0;

  if (!hasData || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[280px] rounded-xl border border-dashed border-border/60 bg-muted/20 text-muted-foreground p-6 text-center">
        <i className="fa-solid fa-chart-line text-4xl mb-3 opacity-30 text-secondary" />
        <p className="text-sm font-medium text-foreground">Sin datos de ventas</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-xs">
          No se registraron ventas en el período seleccionado.
        </p>
      </div>
    );
  }

  const isLargeDateRange = data.length > 14;
  const isExtremeDateRange = data.length > 30;
  const chartScrollWidth = isLargeDateRange ? `${Math.max(data.length * 36, 540)}px` : "100%";

  // Custom Rich Tooltip for Sales Chart
  const CustomSalesTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    const point = payload[0]?.payload as (SalesTrendPoint & { avgTicket: number }) | undefined;
    if (!point) return null;

    return (
      <div className="bg-popover/95 backdrop-blur-md border border-border rounded-xl p-3 shadow-2xl text-xs space-y-2 min-w-[200px] z-50">
        <div className="flex items-center justify-between border-b border-border/60 pb-1.5 gap-2">
          <span className="font-bold text-foreground flex items-center gap-1.5 truncate">
            <i className="fa-regular fa-clock text-secondary shrink-0" />
            {point.exactTime || label}
          </span>
          <span className="bg-accent/10 text-accent font-bold px-2 py-0.5 rounded-full text-[11px] shrink-0">
            {point.tickets} {point.tickets === 1 ? "ticket" : "tickets"}
          </span>
        </div>

        <div className="space-y-1 pt-0.5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Venta Total:</span>
            <span className="font-bold text-foreground text-sm tabular-nums">
              C$ {point.total.toLocaleString("es-NI", { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Ticket Promedio:</span>
            <span className="font-semibold text-foreground tabular-nums">
              C$ {point.avgTicket.toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col justify-between space-y-4">
      <div className="space-y-4">
        {/* ── 1. Sales KPI Summary Badges ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="bg-background/60 border border-border/60 rounded-xl p-2.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-muted-foreground text-[11px] mb-1">
              <span>Total Ventas</span>
              <i className="fa-solid fa-money-bill-wave text-emerald-500 text-xs" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-base sm:text-lg font-bold text-foreground tabular-nums truncate">
                C$ {totalSales.toLocaleString("es-NI", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-muted-foreground font-medium">
                en {data.length} {granularity === "minute" ? "registros" : "días"}
              </span>
            </div>
          </div>

          <div className="bg-background/60 border border-border/60 rounded-xl p-2.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-muted-foreground text-[11px] mb-1">
              <span>Total Tickets</span>
              <i className="fa-solid fa-ticket text-blue-500 text-xs" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-lg sm:text-xl font-bold text-foreground tabular-nums">
                {totalTickets}
              </span>
              <span className="text-[10px] text-muted-foreground font-medium">
                tickets emitidos
              </span>
            </div>
          </div>

          <div className="bg-background/60 border border-border/60 rounded-xl p-2.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-muted-foreground text-[11px] mb-1">
              <span>Ticket Promedio</span>
              <i className="fa-solid fa-receipt text-purple-500 text-xs" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-base sm:text-lg font-bold text-foreground tabular-nums truncate">
                C$ {avgTicketValue.toFixed(2)}
              </span>
              <span className="text-[10px] text-muted-foreground font-medium">
                por transacción
              </span>
            </div>
          </div>

          <div className="bg-background/60 border border-border/60 rounded-xl p-2.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-muted-foreground text-[11px] mb-1">
              <span>Día Récord</span>
              <i className="fa-solid fa-trophy text-amber-500 text-xs" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs sm:text-sm font-bold text-foreground truncate">
                {bestSalesPoint.exactTime || bestSalesPoint.label}
              </span>
              <span className="text-[10px] text-muted-foreground font-medium tabular-nums">
                C$ {bestSalesPoint.total.toLocaleString("es-NI")}
              </span>
            </div>
          </div>
        </div>

        {/* ── 2. View Mode Switcher (Symmetrical 3-column segmented control) ── */}
        <div className="grid grid-cols-3 gap-1 p-1 bg-muted/40 rounded-xl border border-border/60 w-full">
          <button
            type="button"
            onClick={() => setViewMode("amount")}
            className={`py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              viewMode === "amount"
                ? "bg-card text-foreground shadow-sm font-bold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <i className="fa-solid fa-chart-area text-[11px]" />
            <span>Monto (C$)</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("tickets")}
            className={`py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              viewMode === "tickets"
                ? "bg-card text-foreground shadow-sm font-bold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <i className="fa-solid fa-ticket text-[11px]" />
            <span>Tickets (#)</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("average")}
            className={`py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              viewMode === "average"
                ? "bg-card text-foreground shadow-sm font-bold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <i className="fa-solid fa-scale-balanced text-[11px]" />
            <span>Promedio</span>
          </button>
        </div>

        {/* ── 3. Symmetrical Sales Breakdown Filter Grid (Matching Vehicle Grid) ── */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setSelectedFilter(null)}
            className={`w-full px-3 py-2 rounded-xl text-xs transition-all flex items-center justify-between border ${
              selectedFilter === null
                ? "bg-primary text-primary-foreground font-bold shadow-sm border-primary ring-1 ring-primary/40"
                : "bg-background/70 hover:bg-muted/60 text-muted-foreground border-border/60"
            }`}
          >
            <span className="flex items-center gap-2">
              <i className="fa-solid fa-chart-line text-xs" />
              <span>Resumen General de Ingresos</span>
            </span>
            <span className="tabular-nums font-semibold text-[11px] opacity-90">
              C$ {totalSales.toLocaleString("es-NI")} · 100%
            </span>
          </button>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div className="p-2.5 rounded-xl text-xs bg-background/70 border border-border/60 flex items-center justify-between gap-2 min-h-[44px]">
              <div className="flex items-center gap-2 min-w-0 truncate">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0 shadow-sm" />
                <span className="truncate font-semibold text-foreground">Altas Ventas</span>
              </div>
              <span className="font-bold text-foreground tabular-nums text-right">{highSalesDays} días</span>
            </div>

            <div className="p-2.5 rounded-xl text-xs bg-background/70 border border-border/60 flex items-center justify-between gap-2 min-h-[44px]">
              <div className="flex items-center gap-2 min-w-0 truncate">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0 shadow-sm" />
                <span className="truncate font-semibold text-foreground">Ventas Medias</span>
              </div>
              <span className="font-bold text-foreground tabular-nums text-right">{medSalesDays} días</span>
            </div>

            <div className="p-2.5 rounded-xl text-xs bg-background/70 border border-border/60 flex items-center justify-between gap-2 min-h-[44px]">
              <div className="flex items-center gap-2 min-w-0 truncate">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0 shadow-sm" />
                <span className="truncate font-semibold text-foreground">Ventas Bajas</span>
              </div>
              <span className="font-bold text-foreground tabular-nums text-right">{lowSalesDays} días</span>
            </div>
          </div>
        </div>

        {/* ── 4. Main Sales Chart Canvas ── */}
        <div className="space-y-1.5 flex-1 min-h-[280px]">
          {isLargeDateRange && (
            <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
              <span className="flex items-center gap-1 text-secondary font-medium">
                <i className="fa-solid fa-arrows-left-right text-[10px]" />
                Período amplio ({data.length} días)
              </span>
              <span className="text-[10px] opacity-75 sm:hidden">
                Desliza para ver más fechas ➔
              </span>
            </div>
          )}

          <div className="overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin scrollbar-thumb-muted-foreground/20">
            <div
              style={{
                width: isLargeDateRange ? chartScrollWidth : "100%",
                minWidth: "100%",
                height: 280,
              }}
            >
              <ResponsiveContainer width="100%" height="100%">
                {viewMode === "amount" ? (
                  <AreaChart
                    data={chartData}
                    margin={{ left: -12, right: 12, top: 16, bottom: isLargeDateRange ? 16 : 4 }}
                  >
                    <defs>
                      <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563EB" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#2563EB" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
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
                      tickMargin={4}
                      width={48}
                      tick={{
                        fontSize: 10,
                        fill: "currentColor",
                        className: "text-muted-foreground",
                      }}
                      tickFormatter={(v) =>
                        v >= 1000 ? `C$${(v / 1000).toFixed(0)}k` : `C$${v}`
                      }
                    />
                    <Tooltip content={<CustomSalesTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="total"
                      name="Ventas (C$)"
                      stroke="#2563EB"
                      strokeWidth={3}
                      fill="url(#salesGradient)"
                      dot={chartData.length <= 14 ? { r: 3, fill: "#2563EB" } : false}
                      activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }}
                    />
                  </AreaChart>
                ) : viewMode === "tickets" ? (
                  <BarChart
                    data={chartData}
                    margin={{ left: -12, right: 12, top: 16, bottom: isLargeDateRange ? 16 : 4 }}
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
                    <Tooltip content={<CustomSalesTooltip />} />
                    <Bar
                      dataKey="tickets"
                      name="Tickets"
                      fill="#10B981"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={44}
                    />
                  </BarChart>
                ) : (
                  <LineChart
                    data={chartData}
                    margin={{ left: -12, right: 12, top: 16, bottom: isLargeDateRange ? 16 : 4 }}
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
                      tickMargin={4}
                      width={48}
                      tick={{
                        fontSize: 10,
                        fill: "currentColor",
                        className: "text-muted-foreground",
                      }}
                      tickFormatter={(v) => `C$${v}`}
                    />
                    <Tooltip content={<CustomSalesTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="avgTicket"
                      name="Ticket Promedio"
                      stroke="#8B5CF6"
                      strokeWidth={3}
                      dot={{ r: 3, fill: "#8B5CF6" }}
                      activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }}
                    />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* ── 5. Key Highlights / Sales Records Footer (Symmetrical to Vehicle Footer) ── */}
      <div className="pt-2 border-t border-border/50">
        <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <i className="fa-solid fa-award text-amber-500" />
          Récords y Desglose de Ventas
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <div className="flex flex-col justify-between p-2.5 rounded-xl border border-border/50 bg-background/50 text-xs min-h-[50px]">
            <span className="text-[11px] text-muted-foreground font-medium mb-1 truncate">
              🚀 Venta Máxima Diaria
            </span>
            <div className="flex items-baseline justify-between gap-1">
              <span className="font-bold text-foreground text-xs tabular-nums">
                C$ {bestSalesPoint.total.toLocaleString("es-NI")}
              </span>
              <span className="text-[10px] text-muted-foreground truncate">
                {bestSalesPoint.exactTime || bestSalesPoint.label}
              </span>
            </div>
          </div>

          <div className="flex flex-col justify-between p-2.5 rounded-xl border border-border/50 bg-background/50 text-xs min-h-[50px]">
            <span className="text-[11px] text-muted-foreground font-medium mb-1 truncate">
              🎟️ Récord Tickets
            </span>
            <div className="flex items-baseline justify-between gap-1">
              <span className="font-bold text-foreground text-xs tabular-nums">
                {bestTicketPoint.tickets} tickets
              </span>
              <span className="text-[10px] text-muted-foreground truncate">
                {bestTicketPoint.exactTime || bestTicketPoint.label}
              </span>
            </div>
          </div>

          <div className="flex flex-col justify-between p-2.5 rounded-xl border border-border/50 bg-background/50 text-xs min-h-[50px]">
            <span className="text-[11px] text-muted-foreground font-medium mb-1 truncate">
              📊 Venta Prom. / Día
            </span>
            <div className="flex items-baseline justify-between gap-1">
              <span className="font-bold text-foreground text-xs tabular-nums">
                C$ {dailySalesAvg.toFixed(2)}
              </span>
              <span className="text-[10px] text-muted-foreground">
                /día
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
