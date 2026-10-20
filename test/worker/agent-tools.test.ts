import { describe, expect, it, vi } from "vitest";
import {
	createToolbox,
	TOOL_DEFINITIONS,
	type ToolDeps,
} from "../../src/worker/agent/tools";
import { MarketDataError, type MarketSnapshot } from "../../src/worker/alpaca";

const NOW = new Date("2026-10-19T19:42:00Z");

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
		now: () => NOW,
		...overrides,
	};
}

describe("TOOL_DEFINITIONS", () => {
	it("declares exactly the five agent tools", () => {
		expect(TOOL_DEFINITIONS.map((tool) => tool.name).sort()).toEqual([
			"add_symbols",
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
				result: { asOf: NOW.toISOString(), rows, unavailable: [] },
				events: [{ type: "snapshots", asOf: NOW.toISOString(), rows }],
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
