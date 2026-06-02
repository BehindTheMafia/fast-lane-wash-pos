import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { VehicleByDayChartData } from "@/lib/reportsChartData";

const PALETTE = [
  "hsl(217, 91%, 60%)",
  "hsl(142, 71%, 45%)",
  "hsl(25, 95%, 53%)",
  "hsl(263, 70%, 58%)",
  "hsl(199, 89%, 48%)",
  "hsl(340, 75%, 55%)",
  "hsl(48, 96%, 53%)",
  "hsl(220, 9%, 46%)",
];

interface Props {
  data: VehicleByDayChartData;
}

export default function ReportsVehicleByDayChart({ data }: Props) {
  const { rows, vehicleTypes } = data;

  const chartConfig = useMemo(() => {
    const config: ChartConfig = {};
    vehicleTypes.forEach((vt, i) => {
      config[vt.slug] = {
        label: vt.label,
        color: PALETTE[i % PALETTE.length],
      };
    });
    return config;
  }, [vehicleTypes]);

  const insights = useMemo(() => {
    return vehicleTypes
      .map((vt) => {
        let max = 0;
        let maxLabel = "";
        rows.forEach((row) => {
          const c = Number(row[vt.slug]) || 0;
          if (c > max) {
            max = c;
            maxLabel = row.label;
          }
        });
        if (max === 0) return null;
        return `${vt.label} — más visitas: ${maxLabel} (${max})`;
      })
      .filter(Boolean) as string[];
  }, [rows, vehicleTypes]);

  const hasVisits = rows.some((row) =>
    vehicleTypes.some((vt) => (Number(row[vt.slug]) || 0) > 0),
  );

  if (rows.length === 0 || vehicleTypes.length === 0 || !hasVisits) {
    return (
      <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
        <i className="fa-solid fa-chart-column mr-2 opacity-40" />
        Sin datos en este período
      </div>
    );
  }

  const rotateLabels = rows.length > 14;
  const chartHeight = rotateLabels ? "h-[320px]" : "h-[280px]";

  return (
    <div className="space-y-3">
      <ChartContainer config={chartConfig} className={`aspect-auto w-full ${chartHeight}`}>
        <BarChart data={rows} margin={{ left: 4, right: 8, top: 8, bottom: rotateLabels ? 8 : 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            interval={0}
            angle={rotateLabels ? -35 : 0}
            textAnchor={rotateLabels ? "end" : "middle"}
            height={rotateLabels ? 56 : 32}
            tick={{ fontSize: 10 }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            tickMargin={4}
            width={32}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(label) => label}
                formatter={(value, name) => {
                  const label = chartConfig[name as string]?.label ?? name;
                  const num = Number(value);
                  return (
                    <span className="font-medium">
                      {label}: {num} visita{num !== 1 ? "s" : ""}
                    </span>
                  );
                }}
              />
            }
          />
          <ChartLegend content={<ChartLegendContent />} />
          {vehicleTypes.map((vt) => (
            <Bar
              key={vt.slug}
              dataKey={vt.slug}
              fill={`var(--color-${vt.slug})`}
              radius={[4, 4, 0, 0]}
            />
          ))}
        </BarChart>
      </ChartContainer>
      {insights.length > 0 && (
        <div className="space-y-1 border-t border-border pt-2">
          {insights.map((line) => (
            <p key={line} className="text-[10px] text-muted-foreground leading-snug">
              <i className="fa-solid fa-arrow-trend-up mr-1 text-secondary" />
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
