import { describe, expect, it, vi } from "vitest";
import { fetchReportRows, fetchReportRowsForIds } from "./fetchReportRows";

describe("report pagination", () => {
  it("loads every ticket beyond the first 1,000 rows", async () => {
    const tickets = Array.from({ length: 1202 }, (_, id) => ({ id }));
    const fetchPage = vi.fn(async (from: number, to: number) => ({
      data: tickets.slice(from, to + 1),
      error: null,
    }));

    expect(await fetchReportRows(fetchPage)).toHaveLength(1202);
    expect(fetchPage.mock.calls).toEqual([[0, 499], [500, 999], [1000, 1499]]);
  });

  it("loads related rows in small ID groups and paginates within each group", async () => {
    const ids = Array.from({ length: 101 }, (_, id) => id + 1);
    const fetchPage = vi.fn(async (chunk: number[], from: number, to: number) => ({
      data: Array.from({ length: chunk[0] === 1 ? 510 : 1 }, (_, index) => ({ ticket_id: chunk[0], index })).slice(from, to + 1),
      error: null,
    }));

    expect(await fetchReportRowsForIds(ids, fetchPage)).toHaveLength(511);
    expect(fetchPage.mock.calls.map(([chunk, from]) => [chunk.length, from])).toEqual([
      [100, 0], [100, 500], [1, 0],
    ]);
  });

  it("reports a page error instead of using incomplete data", async () => {
    const fetchPage = vi.fn(async (from: number) => ({
      data: from === 0 ? Array.from({ length: 500 }, (_, id) => ({ id })) : null,
      error: from === 0 ? null : { message: "page failed" },
    }));

    await expect(fetchReportRows(fetchPage)).rejects.toMatchObject({ message: "page failed" });
  });
});
