/**
 * Nicaragua timezone utilities.
 * All dates/times in the app must use these helpers to ensure
 * consistent display regardless of the user's device timezone.
 */

const NI_TZ = "America/Managua";

/** Format a date string for display (dd/MM/yyyy) */
export const niFormatDate = (iso: string | Date, opts?: Intl.DateTimeFormatOptions) =>
    new Date(iso).toLocaleDateString("es-NI", { timeZone: NI_TZ, ...opts });

/** Format a time string for display (hh:mm a.m./p.m.) */
export const niFormatTime = (iso: string | Date, opts?: Intl.DateTimeFormatOptions) =>
    new Date(iso).toLocaleTimeString("es-NI", {
        timeZone: NI_TZ,
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        ...opts,
    });

/** Get today's date as YYYY-MM-DD in Nicaragua timezone */
export const niToday = (): string => {
    return new Date().toLocaleDateString("en-CA", { timeZone: NI_TZ });
};

/** Get the start of today (00:00:00) in Nicaragua timezone as an ISO string */
export const niStartOfDay = (): string => {
    const todayStr = niToday(); // YYYY-MM-DD
    return new Date(todayStr + "T00:00:00-06:00").toISOString();
};

/** Format a long date like "domingo, 8 de marzo de 2026" */
export const niFormatLongDate = (date?: Date): string => {
    const d = date || new Date();
    return d.toLocaleDateString("es-NI", {
        timeZone: NI_TZ,
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
    });
};

/** Format short date like "08 mar 2026" */
export const niFormatShortDate = (iso: string | Date): string =>
    new Date(iso).toLocaleDateString("es-NI", {
        timeZone: NI_TZ,
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
