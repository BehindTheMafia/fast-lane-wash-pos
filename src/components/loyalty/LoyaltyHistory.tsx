import type { LoyaltyWashLog, LoyaltyRedemption } from "@/hooks/useLoyaltyV3";
import { getLoyaltyTheme } from "./loyaltyTheme";

interface Props {
  washLog: LoyaltyWashLog[];
  redemptions: LoyaltyRedemption[];
  loading?: boolean;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; color: string; border: string }> = {
    available: { bg: "#FFF1DF", color: "#7F0000", border: "#C89B5A" },
    redeemed:  { bg: "#FEF2DD", color: "#002C47", border: "#E8DECC" },
    expired:   { bg: "#F3EFE6", color: "#456A83", border: "#E8DECC" },
  };
  const labels: Record<string, string> = {
    available: "Disponible",
    redeemed:  "Canjeada",
    expired:   "Expirada",
  };

  const style = styles[status] ?? { bg: "#FEF2DD", color: "#002C47", border: "#E8DECC" };

  return (
    <span
      className="text-xs px-2.5 py-0.5 rounded-full font-bold border"
      style={{
        backgroundColor: style.bg,
        color: style.color,
        borderColor: style.border,
      }}
    >
      {labels[status] ?? status}
    </span>
  );
}

export default function LoyaltyHistory({ washLog, redemptions, loading }: Props) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <i className="fa-solid fa-spinner fa-spin text-3xl" style={{ color: "#002C47" }} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Wash History Table ── */}
      <div>
        <h3 className="font-bold text-sm mb-3 flex items-center gap-2" style={{ color: "#002C47" }}>
          <i className="fa-solid fa-clock-rotate-left" style={{ color: "#456A83" }} />
          Historial de lavadas
        </h3>
        {washLog.length === 0 ? (
          <div className="text-center py-8 text-sm font-medium" style={{ color: "#456A83" }}>
            <i className="fa-solid fa-car-wash text-3xl mb-2 opacity-30" />
            <p>Sin historial registrado</p>
          </div>
        ) : (
          <div className="rounded-2xl border overflow-hidden shadow-xs" style={{ borderColor: "#E8DECC", backgroundColor: "#FFFFFF" }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide font-bold" style={{ backgroundColor: "#FEF2DD", color: "#002C47" }}>
                    <th className="text-left px-4 py-3">Fecha</th>
                    <th className="text-left px-4 py-3">Servicio</th>
                    <th className="text-left px-4 py-3">Programa</th>
                    <th className="text-center px-4 py-3">Lavada #</th>
                    <th className="text-left px-4 py-3">Premio obtenido</th>
                    <th className="text-left px-4 py-3">Factura</th>
                  </tr>
                </thead>
                <tbody>
                  {washLog.map((log, idx) => {
                    const theme = getLoyaltyTheme(log.loyalty_programs?.slug);
                    return (
                      <tr
                        key={log.id}
                        className="border-t transition-colors hover:bg-[#FEF2DD]/40"
                        style={{
                          borderColor: "#E8DECC",
                          backgroundColor: idx % 2 === 0 ? "#FFFFFF" : "#FAF8F5",
                        }}
                      >
                        <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: "#456A83" }}>
                          {new Date(log.created_at).toLocaleDateString("es-NI", {
                            day: "2-digit",
                            month: "short",
                            year: "2-digit",
                          })}
                          <span className="block text-[10px]" style={{ color: "#456A83" }}>
                            {new Date(log.created_at).toLocaleTimeString("es-NI", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-bold" style={{ color: "#002C47" }}>
                          {log.services?.name ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          {log.loyalty_programs ? (
                            <span
                              className="text-xs px-2.5 py-0.5 rounded-full font-bold border"
                              style={{
                                backgroundColor: theme.badgeBg,
                                color: theme.primary,
                                borderColor: theme.badgeBorder,
                              }}
                            >
                              {log.loyalty_programs.name}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3 text-center font-black" style={{ color: "#002C47" }}>
                          {log.wash_number}
                        </td>
                        <td className="px-4 py-3">
                          {log.loyalty_rewards ? (
                            <span className="text-xs font-bold flex items-center gap-1.5" style={{ color: theme.primary }}>
                              <i className="fa-solid fa-gift" style={{ color: theme.accent }} />
                              {log.loyalty_rewards.reward_name}
                            </span>
                          ) : (
                            <span className="text-xs" style={{ color: "#456A83" }}>—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs font-semibold" style={{ color: "#456A83" }}>
                          {log.tickets?.ticket_number ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Redemptions History Table ── */}
      <div>
        <h3 className="font-bold text-sm mb-3 flex items-center gap-2" style={{ color: "#002C47" }}>
          <i className="fa-solid fa-receipt" style={{ color: "#456A83" }} />
          Historial de canjes
        </h3>
        {redemptions.length === 0 ? (
          <div className="text-center py-8 text-sm font-medium" style={{ color: "#456A83" }}>
            <i className="fa-solid fa-gift text-3xl mb-2 opacity-30" />
            <p>Sin canjes registrados</p>
          </div>
        ) : (
          <div className="rounded-2xl border overflow-hidden shadow-xs" style={{ borderColor: "#E8DECC", backgroundColor: "#FFFFFF" }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide font-bold" style={{ backgroundColor: "#FEF2DD", color: "#002C47" }}>
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
                      className="border-t transition-colors hover:bg-[#FEF2DD]/40"
                      style={{
                        borderColor: "#E8DECC",
                        backgroundColor: idx % 2 === 0 ? "#FFFFFF" : "#FAF8F5",
                      }}
                    >
                      <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: "#456A83" }}>
                        {new Date(r.redeemed_at).toLocaleDateString("es-NI", {
                          day: "2-digit",
                          month: "short",
                          year: "2-digit",
                        })}
                        <span className="block text-[10px]" style={{ color: "#456A83" }}>
                          {new Date(r.redeemed_at).toLocaleTimeString("es-NI", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-bold" style={{ color: "#002C47" }}>
                        {r.loyalty_rewards?.reward_name ?? "—"}
                      </td>
                      <td className="px-4 py-3 font-medium" style={{ color: "#002C47" }}>
                        {r.loyalty_rewards?.loyalty_programs?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status="redeemed" />
                        {r.overridden_by_admin && (
                          <span className="ml-1.5 text-xs font-bold text-red-700">
                            (override admin)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold" style={{ color: "#456A83" }}>
                        {r.ticket_id ? `#${r.ticket_id}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs max-w-[180px] truncate" style={{ color: "#456A83" }}>
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
