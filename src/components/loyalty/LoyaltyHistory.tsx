import type { LoyaltyWashLog, LoyaltyRedemption } from "@/hooks/useLoyaltyV3";

interface Props {
  washLog: LoyaltyWashLog[];
  redemptions: LoyaltyRedemption[];
  loading?: boolean;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    available: "bg-primary/10 text-primary",
    redeemed:  "bg-accent/10 text-accent",
    expired:   "bg-muted text-muted-foreground",
  };
  const labels: Record<string, string> = {
    available: "Disponible",
    redeemed:  "Canjeada",
    expired:   "Expirada",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${map[status] ?? ""}`}>
      {labels[status] ?? status}
    </span>
  );
}

export default function LoyaltyHistory({ washLog, redemptions, loading }: Props) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <i className="fa-solid fa-spinner fa-spin text-3xl text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Wash history ── */}
      <div>
        <h3 className="font-bold text-sm text-foreground mb-3 flex items-center gap-2">
          <i className="fa-solid fa-clock-rotate-left text-secondary" />
          Historial de lavadas
        </h3>
        {washLog.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <i className="fa-solid fa-car-wash text-3xl mb-2 opacity-30" />
            <p>Sin historial registrado</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wide">
                    <th className="text-left px-4 py-3">Fecha</th>
                    <th className="text-left px-4 py-3">Servicio</th>
                    <th className="text-left px-4 py-3">Programa</th>
                    <th className="text-center px-4 py-3">Lavada #</th>
                    <th className="text-left px-4 py-3">Premio obtenido</th>
                    <th className="text-left px-4 py-3">Factura</th>
                  </tr>
                </thead>
                <tbody>
                  {washLog.map((log, idx) => (
                    <tr
                      key={log.id}
                      className={`border-t border-border/50 transition-colors hover:bg-muted/30 ${
                        idx % 2 === 0 ? "" : "bg-muted/10"
                      }`}
                    >
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(log.created_at).toLocaleDateString("es-NI", {
                          day: "2-digit",
                          month: "short",
                          year: "2-digit",
                        })}
                        <span className="block">
                          {new Date(log.created_at).toLocaleTimeString("es-NI", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {log.services?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        {log.loyalty_programs ? (
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                              log.loyalty_programs.slug === "premium"
                                ? "bg-primary/10 text-primary"
                                : "bg-accent/10 text-accent"
                            }`}
                          >
                            {log.loyalty_programs.name}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 text-center font-bold">
                        {log.wash_number}
                      </td>
                      <td className="px-4 py-3">
                        {log.loyalty_rewards ? (
                          <span className="text-xs text-primary font-semibold flex items-center gap-1">
                            <i className="fa-solid fa-gift" />
                            {log.loyalty_rewards.reward_name}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {log.tickets?.ticket_number ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Redemptions history ── */}
      <div>
        <h3 className="font-bold text-sm text-foreground mb-3 flex items-center gap-2">
          <i className="fa-solid fa-receipt text-secondary" />
          Historial de canjes
        </h3>
        {redemptions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <i className="fa-solid fa-gift text-3xl mb-2 opacity-30" />
            <p>Sin canjes registrados</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wide">
                    <th className="text-left px-4 py-3">Fecha</th>
                    <th className="text-left px-4 py-3">Premio</th>
                    <th className="text-left px-4 py-3">Programa</th>
                    <th className="text-left px-4 py-3">Estado</th>
                    <th className="text-left px-4 py-3">Factura</th>
                    <th className="text-left px-4 py-3">Notas</th>
                  </tr>
                </thead>
                <tbody>
                  {redemptions.map((r, idx) => (
                    <tr
                      key={r.id}
                      className={`border-t border-border/50 hover:bg-muted/30 ${
                        idx % 2 === 0 ? "" : "bg-muted/10"
                      }`}
                    >
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(r.redeemed_at).toLocaleDateString("es-NI", {
                          day: "2-digit",
                          month: "short",
                          year: "2-digit",
                        })}
                        <span className="block">
                          {new Date(r.redeemed_at).toLocaleTimeString("es-NI", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {r.loyalty_rewards?.reward_name ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        {r.loyalty_rewards?.loyalty_programs?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status="redeemed" />
                        {r.overridden_by_admin && (
                          <span className="ml-1 text-xs text-destructive font-semibold">
                            (override admin)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {r.ticket_id ? `#${r.ticket_id}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-[180px] truncate">
                        {r.notes ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
