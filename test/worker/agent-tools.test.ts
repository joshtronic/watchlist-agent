import { describe, expect, it, vi } from "vitest";
import {
	createToolbox,
	TOOL_DEFINITIONS,
	type ToolDeps,
} from "../../src/worker/agent/tools";
import { MarketDataError, type MarketSnapshot } from "../../src/worker/alpaca";

const NOW = new Date("2026-10-19T19:42:00Z");
const CLOCK = {
	isOpen: false,
	timestamp: "2026-10-19T19:42:00-04:00",
	nextOpen: "2026-10-20T09:30:00-04:00",
	nextClose: "2026-10-20T16:00:00-04:00",
};

function snapshot(symbol: string): MarketSnapshot {
	return {
		symbol,
		price: 100,
		tradeTime: "2026-10-19T19:41:58Z",
		prevClose: 99,
		change: 1,
		changePct: 1.0101,
		dayOpen: 99.5,
		dayHigh: 101,
		dayLow: 98.75,
		dayVolume: 1000,
		bid: 99.9,
		ask: 100.1,
	};
}

// Trading days around a one-week window ending Monday 2026-10-19.
const BARS = [
	{ date: "2026-10-08", open: 90, high: 95, low: 88, close: 92, volume: 1 },
	{ date: "2026-10-09", open: 92, high: 99, low: 91, close: 98, volume: 1 },
	{ date: "2026-10-12", open: 98, high: 104, low: 97, close: 100, volume: 1 },
	{ date: "2026-10-16", open: 100, high: 112, low: 96, close: 110, volume: 1 },
	{ date: "2026-10-19", open: 110, high: 111, low: 104, close: 105, volume: 1 },
];

function article(id: number, symbol: string) {
	return {
		id,
		headline: `${symbol} headline`,
		summary: "x".repeat(600),
		source: "benzinga",
		url: `https://example.com/${id}`,
		symbols: [symbol],
		createdAt: "2026-10-19T16:31:00Z",
	};
}

function deps(overrides: Partial<ToolDeps> = {}): ToolDeps {
	let watchlist = ["NET", "AAPL"];
	return {
		getWatchlist: vi.fn(async () => [...watchlist]),
		addSymbols: vi.fn(async (symbols: string[]) =>
			symbols.map((symbol) => {
				if (watchlist.includes(symbol)) {
					return { symbol, status: "already_present" as const };
				}
				watchlist = [...watchlist, symbol];
				return { symbol, status: "added" as const };
			}),
		),
		removeSymbols: vi.fn(async (symbols: string[]) =>
			symbols.map((symbol) => {
				if (!watchlist.includes(symbol)) {
					return { symbol, status: "not_present" as const };
				}
				watchlist = watchlist.filter((s) => s !== symbol);
				return { symbol, status: "removed" as const };
			}),
		),
		checkAsset: vi.fn(async (symbol: string) => ({
			symbol,
			status: "valid" as const,
		})),
		getSnapshots: vi.fn(async (symbols: string[]) => symbols.map(snapshot)),
		getClock: vi.fn(async () => CLOCK),
		getNews: vi.fn(async (symbols: string[], _limit: number) =>
			symbols.map((symbol, index) => article(index + 1, symbol)),
		),
		getDailyBars: vi.fn(async (symbols: string[]) =>
			Object.fromEntries(symbols.map((symbol) => [symbol, BARS])),
		),
		now: () => NOW,
		...overrides,
	};
}

describe("TOOL_DEFINITIONS", () => {
	it("declares exactly the agent tools", () => {
		expect(TOOL_DEFINITIONS.map((tool) => tool.name).sort()).toEqual([
			"add_symbols",
			"get_news",
			"get_price_history",
			"get_snapshots",
			"list_watchlist",
			"remove_symbols",
			"respond",
		]);
	});
});

describe("toolbox", () => {
	it("rejects an unknown tool", async () => {
		const outcome = await createToolbox(deps()).execute({
			name: "buy_stock",
			arguments: {},
		});

		expect(outcome).toEqual({
			result: { error: "unknown_tool", tool: "buy_stock" },
			events: [],
		});
	});

	it("lists the watchlist", async () => {
		const outcome = await createToolbox(deps()).execute({
			name: "list_watchlist",
			arguments: {},
		});

		expect(outcome).toEqual({
			result: { symbols: ["NET", "AAPL"] },
			events: [],
		});
	});

	describe.each(["add_symbols", "remove_symbols"])("%s", (name) => {
		it.each([
			["missing symbols", {}],
			["not an array", { symbols: "NET" }],
			["an empty list", { symbols: [] }],
			["more than ten symbols", { symbols: Array(11).fill("NET") }],
			["a non-string symbol", { symbols: [42] }],
			["unparsed text", "{oops"],
		])("rejects %s without touching anything", async (_label, args) => {
			const d = deps();

			const outcome = await createToolbox(d).execute({
				name,
				arguments: args,
			});

			expect(outcome.result).toMatchObject({ error: "invalid_arguments" });
			expect(outcome.events).toEqual([]);
			expect(d.addSymbols).not.toHaveBeenCalled();
			expect(d.removeSymbols).not.toHaveBeenCalled();
			expect(d.checkAsset).not.toHaveBeenCalled();
		});
	});

	describe("add_symbols", () => {
		it("adds valid symbols and announces the new watchlist", async () => {
			const d = deps();

			const outcome = await createToolbox(d).execute({
				name: "add_symbols",
				arguments: { symbols: ["mu"] },
			});

			expect(d.checkAsset).toHaveBeenCalledWith("MU");
			expect(outcome).toEqual({
				result: { results: [{ symbol: "MU", status: "added" }] },
				events: [{ type: "watchlist", symbols: ["NET", "AAPL", "MU"] }],
			});
		});

		it("reports each symbol's outcome in the order asked", async () => {
			const d = deps({
				checkAsset: vi.fn(async (symbol: string) => ({
					symbol,
					status:
						symbol === "ZZZZ"
							? ("invalid" as const)
							: symbol === "BTC"
								? ("not_tradable" as const)
								: ("valid" as const),
				})),
			});

			const outcome = await createToolbox(d).execute({
				name: "add_symbols",
				arguments: { symbols: ["ZZZZ", "net", "$$$", "BTC", "MU"] },
			});

			expect(outcome.result).toEqual({
				results: [
					{ symbol: "ZZZZ", status: "invalid" },
					{ symbol: "NET", status: "already_present" },
					{ symbol: "$$$", status: "invalid" },
					{ symbol: "BTC", status: "not_tradable" },
					{ symbol: "MU", status: "added" },
				],
			});
			expect(d.addSymbols).toHaveBeenCalledWith(["MU"]);
		});

		it("skips the market lookup for malformed and already-listed symbols", async () => {
			const d = deps();

			await createToolbox(d).execute({
				name: "add_symbols",
				arguments: { symbols: ["NET", "not a symbol"] },
			});

			expect(d.checkAsset).not.toHaveBeenCalled();
		});

		it("passes the cap through from storage", async () => {
			const d = deps({
				addSymbols: vi.fn(async (symbols: string[]) =>
					symbols.map((symbol) => ({
						symbol,
						status: "cap_reached" as const,
					})),
				),
			});

			const outcome = await createToolbox(d).execute({
				name: "add_symbols",
				arguments: { symbols: ["MU"] },
			});

			expect(outcome).toEqual({
				result: { results: [{ symbol: "MU", status: "cap_reached" }] },
				events: [],
			});
		});

		it("returns market data errors to the model without changing anything", async () => {
			const d = deps({
				checkAsset: vi.fn(async () => {
					throw new MarketDataError("market_data_rate_limited", "429");
				}),
			});

			const outcome = await createToolbox(d).execute({
				name: "add_symbols",
				arguments: { symbols: ["MU"] },
			});

			expect(outcome.result).toMatchObject({
				error: "market_data_rate_limited",
			});
			expect(outcome.events).toEqual([]);
			expect(d.addSymbols).not.toHaveBeenCalled();
		});
	});

	describe("remove_symbols", () => {
		it("removes symbols and announces the new watchlist", async () => {
			const outcome = await createToolbox(deps()).execute({
				name: "remove_symbols",
				arguments: { symbols: ["aapl", "TSLA"] },
			});

			expect(outcome).toEqual({
				result: {
					results: [
						{ symbol: "AAPL", status: "removed" },
						{ symbol: "TSLA", status: "not_present" },
					],
				},
				events: [{ type: "watchlist", symbols: ["NET"] }],
			});
		});

		it("announces nothing when nothing was removed", async () => {
			const outcome = await createToolbox(deps()).execute({
				name: "remove_symbols",
				arguments: { symbols: ["TSLA"] },
			});

			expect(outcome.events).toEqual([]);
		});
	});

	describe("get_news", () => {
		it("fetches headlines for the watchlist and emits them for display", async () => {
			const d = deps();

			const outcome = await createToolbox(d).execute({
				name: "get_news",
				arguments: {},
			});

			expect(d.getNews).toHaveBeenCalledWith(["NET", "AAPL"], 5);
			const articles = [article(1, "NET"), article(2, "AAPL")];
			expect(outcome.events).toEqual([{ type: "news", articles }]);
		});

		it("gives the model shortened summaries to classify", async () => {
			const outcome = await createToolbox(deps()).execute({
				name: "get_news",
				arguments: { symbols: ["NET"] },
			});

			const [first] = (outcome.result as { articles: { summary: string }[] })
				.articles;
			expect(first?.summary.length).toBeLessThanOrEqual(400);
			expect(outcome.result).toMatchObject({
				articles: [{ id: 1, headline: "NET headline" }],
			});
		});

		it("passes a requested limit through", async () => {
			const d = deps();

			await createToolbox(d).execute({
				name: "get_news",
				arguments: { symbols: ["NET"], limit: 3 },
			});

			expect(d.getNews).toHaveBeenCalledWith(["NET"], 3);
		});

		it.each([0, 11, 2.5, "five"])("rejects a limit of %j", async (limit) => {
			const outcome = await createToolbox(deps()).execute({
				name: "get_news",
				arguments: { limit },
			});

			expect(outcome.result).toMatchObject({ error: "invalid_arguments" });
		});

		it("checks off-list symbols first", async () => {
			const d = deps({
				checkAsset: vi.fn(async (symbol: string) => ({
					symbol,
					status: "invalid" as const,
				})),
			});

			const outcome = await createToolbox(d).execute({
				name: "get_news",
				arguments: { symbols: ["ZZZZ"] },
			});

			expect(d.getNews).not.toHaveBeenCalled();
			expect(outcome).toEqual({
				result: {
					articles: [],
					unavailable: [{ symbol: "ZZZZ", status: "invalid" }],
				},
				events: [],
			});
		});

		it("returns market data errors to the model", async () => {
			const d = deps({
				getNews: vi.fn(async () => {
					throw new MarketDataError("market_data_error", "403");
				}),
			});

			const outcome = await createToolbox(d).execute({
				name: "get_news",
				arguments: {},
			});

			expect(outcome).toEqual({
				result: expect.objectContaining({ error: "market_data_error" }),
				events: [],
			});
		});
	});

	describe("get_price_history", () => {
		it("rejects a missing or unknown period", async () => {
			const toolbox = createToolbox(deps());

			for (const args of [{}, { period: "decade" }, { period: 7 }]) {
				const outcome = await toolbox.execute({
					name: "get_price_history",
					arguments: args,
				});
				expect(outcome.result).toMatchObject({ error: "invalid_arguments" });
			}
		});

		it("measures the change from the last close before the period", async () => {
			const d = deps();

			const outcome = await createToolbox(d).execute({
				name: "get_price_history",
				arguments: { period: "1w", symbols: ["net"] },
			});

			// The week starts 2026-10-12, so the baseline is 2026-10-09's close.
			const row = {
				symbol: "NET",
				onWatchlist: true,
				startDate: "2026-10-09",
				endDate: "2026-10-19",
				startPrice: 98,
				endPrice: 105,
				change: 7,
				changePct: (7 / 98) * 100,
				high: 112,
				low: 96,
			};
			expect(outcome).toEqual({
				result: {
					period: "1w",
					from: "2026-10-12",
					rows: [row],
					unavailable: [],
				},
				events: [
					{ type: "history", period: "1w", from: "2026-10-12", rows: [row] },
				],
			});
		});

		it("asks for bars from before the period and ends at least fifteen minutes ago", async () => {
			const d = deps();

			await createToolbox(d).execute({
				name: "get_price_history",
				arguments: { period: "1w" },
			});

			const [symbols, start, end] =
				vi.mocked(d.getDailyBars).mock.calls[0] ?? [];
			expect(symbols).toEqual(["NET", "AAPL"]);
			expect(new Date(String(start)).getTime()).toBeLessThan(
				new Date("2026-10-12T00:00:00Z").getTime(),
			);
			expect(
				NOW.getTime() - new Date(String(end)).getTime(),
			).toBeGreaterThanOrEqual(15 * 60 * 1000);
		});

		it.each([
			["1m", "2026-09-19"],
			["3m", "2026-07-19"],
			["6m", "2026-04-19"],
			["ytd", "2026-01-01"],
			["1y", "2025-10-19"],
		])("starts the %s period on %s", async (period, from) => {
			const outcome = await createToolbox(deps()).execute({
				name: "get_price_history",
				arguments: { period },
			});

			expect(outcome.result).toMatchObject({ period, from });
		});

		it("falls back to the first open when there is no earlier close", async () => {
			const d = deps({
				getDailyBars: vi.fn(async () => ({ NET: BARS.slice(2) })),
			});

			const outcome = await createToolbox(d).execute({
				name: "get_price_history",
				arguments: { period: "1w", symbols: ["NET"] },
			});

			expect(outcome.result).toMatchObject({
				rows: [{ startDate: "2026-10-12", startPrice: 98, endPrice: 105 }],
			});
		});

		it("returns an empty row for a symbol with no bars in the period", async () => {
			const d = deps({ getDailyBars: vi.fn(async () => ({})) });

			const outcome = await createToolbox(d).execute({
				name: "get_price_history",
				arguments: { period: "1w", symbols: ["NET"] },
			});

			expect(outcome.result).toMatchObject({
				rows: [
					{
						symbol: "NET",
						startPrice: null,
						endPrice: null,
						change: null,
						changePct: null,
					},
				],
			});
		});

		it("checks off-list symbols before looking them up", async () => {
			const d = deps({
				checkAsset: vi.fn(async (symbol: string) => ({
					symbol,
					status: symbol === "ZZZZ" ? ("invalid" as const) : ("valid" as const),
				})),
			});

			const outcome = await createToolbox(d).execute({
				name: "get_price_history",
				arguments: { period: "1w", symbols: ["SNOW", "ZZZZ"] },
			});

			expect(vi.mocked(d.getDailyBars).mock.calls[0]?.[0]).toEqual(["SNOW"]);
			expect(outcome.result).toMatchObject({
				rows: [{ symbol: "SNOW", onWatchlist: false }],
				unavailable: [{ symbol: "ZZZZ", status: "invalid" }],
			});
		});

		it("returns market data errors to the model", async () => {
			const d = deps({
				getDailyBars: vi.fn(async () => {
					throw new MarketDataError("market_data_error", "403");
				}),
			});

			const outcome = await createToolbox(d).execute({
				name: "get_price_history",
				arguments: { period: "1w" },
			});

			expect(outcome).toEqual({
				result: expect.objectContaining({ error: "market_data_error" }),
				events: [],
			});
		});
	});

	describe("get_snapshots", () => {
		it("defaults to the whole watchlist and emits the table data", async () => {
			const d = deps();

			const outcome = await createToolbox(d).execute({
				name: "get_snapshots",
				arguments: {},
			});

			const rows = [
				{ ...snapshot("NET"), onWatchlist: true },
				{ ...snapshot("AAPL"), onWatchlist: true },
			];
			expect(d.checkAsset).not.toHaveBeenCalled();
			expect(outcome).toEqual({
				result: {
					asOf: NOW.toISOString(),
					market: CLOCK,
					rows,
					unavailable: [],
				},
				events: [
					{ type: "snapshots", asOf: NOW.toISOString(), market: CLOCK, rows },
				],
			});
		});

		it("still returns snapshots when the market clock is unavailable", async () => {
			const d = deps({
				getClock: vi.fn(async () => {
					throw new MarketDataError("market_data_error", "500");
				}),
			});

			const outcome = await createToolbox(d).execute({
				name: "get_snapshots",
				arguments: {},
			});

			expect(outcome.result).toMatchObject({ market: null });
			expect(outcome.events[0]).toMatchObject({
				type: "snapshots",
				market: null,
			});
		});

		it("checks off-list symbols and flags them as not on the watchlist", async () => {
			const d = deps({
				checkAsset: vi.fn(async (symbol: string) => ({
					symbol,
					status: symbol === "ZZZZ" ? ("invalid" as const) : ("valid" as const),
				})),
			});

			const outcome = await createToolbox(d).execute({
				name: "get_snapshots",
				arguments: { symbols: ["net", "SNOW", "ZZZZ"] },
			});

			expect(d.checkAsset).toHaveBeenCalledTimes(2);
			expect(d.getSnapshots).toHaveBeenCalledWith(["NET", "SNOW"]);
			expect(outcome.result).toEqual({
				asOf: NOW.toISOString(),
				market: CLOCK,
				rows: [
					{ ...snapshot("NET"), onWatchlist: true },
					{ ...snapshot("SNOW"), onWatchlist: false },
				],
				unavailable: [{ symbol: "ZZZZ", status: "invalid" }],
			});
		});

		it("says so when there is nothing to look up", async () => {
			const d = deps({ getWatchlist: vi.fn(async () => []) });

			const outcome = await createToolbox(d).execute({
				name: "get_snapshots",
				arguments: {},
			});

			expect(outcome.result).toMatchObject({ rows: [] });
			expect(outcome.events).toEqual([]);
			expect(d.getSnapshots).not.toHaveBeenCalled();
		});

		it("rejects invalid arguments", async () => {
			const outcome = await createToolbox(deps()).execute({
				name: "get_snapshots",
				arguments: { symbols: "NET" },
			});

			expect(outcome.result).toMatchObject({ error: "invalid_arguments" });
		});

		it("returns market data errors to the model", async () => {
			const d = deps({
				getSnapshots: vi.fn(async () => {
					throw new MarketDataError("market_data_error", "500");
				}),
			});

			const outcome = await createToolbox(d).execute({
				name: "get_snapshots",
				arguments: {},
			});

			expect(outcome.result).toMatchObject({ error: "market_data_error" });
			expect(outcome.events).toEqual([]);
		});
	});
});
