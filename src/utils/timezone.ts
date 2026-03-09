/**
 * Nicaragua timezone utilities.
 * All dates in the system should use Nicaragua time (UTC-6 / America/Managua).
 */

export const NI_TIMEZONE = "America/Managua";

/**
 * Get current date/time in Nicaragua timezone as a Date object.
 * For display purposes — the Date object is still UTC internally,
 * but its string representation is in NI time.
 */
export function nowNI(): Date {
    return new Date(
        new Date().toLocaleString("en-US", { timeZone: NI_TIMEZONE })
    );
}

/**
 * Get today at midnight in Nicaragua timezone as an ISO string.
 * Useful for "gte" queries: everything from today onwards.
 */
export function todayStartISO(): string {
    const ni = nowNI();
    ni.setHours(0, 0, 0, 0);
    return ni.toISOString();
}

/**
 * Get today at 23:59:59.999 in Nicaragua timezone as an ISO string.
 * Useful for "lte" queries: everything up to end of today.
 */
export function todayEndISO(): string {
    const ni = nowNI();
    ni.setHours(23, 59, 59, 999);
    return ni.toISOString();
}

/**
 * Format a date string to Nicaragua locale date.
 */
export function formatDateNI(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString("es-NI", { timeZone: NI_TIMEZONE });
}

/**
 * Format a date string to Nicaragua locale time.
 */
export function formatTimeNI(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleTimeString("es-NI", {
        timeZone: NI_TIMEZONE,
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
    });
}

/**
 * Format a date string to full Nicaragua locale date + time.
 */
export function formatDateTimeNI(iso: string): string {
    return `${formatDateNI(iso)} ${formatTimeNI(iso)}`;
}

/**
 * Get a date range for a specific date in Nicaragua timezone.
 * Returns [start, end] as ISO strings.
 */
export function dateRangeNI(dateStr: string): [string, string] {
    const [y, m, d] = dateStr.split("-").map(Number);
    const from = new Date(y, m - 1, d, 0, 0, 0, 0);
    const to = new Date(y, m - 1, d, 23, 59, 59, 999);
    return [from.toISOString(), to.toISOString()];
}

/**
 * Get today's date as YYYY-MM-DD string in Nicaragua timezone.
 */
export function todayNI(): string {
    const ni = nowNI();
    const year = ni.getFullYear();
    const month = String(ni.getMonth() + 1).padStart(2, "0");
    const day = String(ni.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}
