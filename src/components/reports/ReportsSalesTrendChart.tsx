import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { SalesTrendPoint } from "@/lib/reportsChartData";

const chartConfig = {
  total: {
    label: "Ventas",
    color: "hsl(var(--accent))",
  },
} satisfies ChartConfig;

interface Props {
  data: SalesTrendPoint[];
  granularity: "minute" | "day";
}

export default function ReportsSalesTrendChart({ data, granularity }: Props) {
  const hasData = data.some((d) => d.total > 0);

  if (!hasData) {
    return (
      <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
        <i className="fa-solid fa-chart-line mr-2 opacity-40" />
        Sin datos en este período
      </div>
    );
  }

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-[280px] w-full">
      <AreaChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          interval="preserveStartEnd"
          minTickGap={granularity === "minute" ? 40 : 32}
          angle={granularity === "minute" && data.length > 12 ? -35 : 0}
          textAnchor={granularity === "minute" && data.length > 12 ? "end" : "middle"}
          height={granularity === "minute" && data.length > 12 ? 50 : 30}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={4}
          width={56}
          tickFormatter={(v) => (v >= 1000 ? `C$${(v / 1000).toFixed(0)}k` : `C$${v}`)}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_label, payload) => {
                const point = payload?.[0]?.payload as SalesTrendPoint | undefined;
                return point?.exactTime ?? _label;
              }}
              formatter={(value, _name, item) => {
                const count = (item.payload as SalesTrendPoint)?.tickets ?? 0;
                return (
                  <div className="flex flex-col gap-0.5">
                    <span className="font-bold">C${Number(value).toFixed(2)}</span>
                    <span className="text-muted-foreground text-xs">
                      {count} ticket{count !== 1 ? "s" : ""}
                    </span>
                  </div>
                );
              }}
            />
          }
        />
        <Area
          dataKey="total"
          type="monotone"
          fill="var(--color-total)"
          fillOpacity={0.25}
          stroke="var(--color-total)"
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  );
}
