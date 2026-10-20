import {
	type AssetCheck,
	type DailyBar,
	type MarketClock,
	MarketDataError,
	type MarketSnapshot,
} from "../alpaca";
import {
	type AddStatus,
	normalizeSymbol,
	type RemoveStatus,
	type SymbolResult,
	WATCHLIST_CAP,
} from "../watchlist";
import type { ToolCall, ToolDefinition } from "./ai-client";

// Storage outcomes plus the market check's verdict on symbols it rejected.
export type AddToolStatus = AddStatus | "not_tradable";

export interface SnapshotRow extends MarketSnapshot {
	onWatchlist: boolean;
}

export type HistoryPeriod = "1w" | "1m" | "3m" | "6m" | "ytd" | "1y";

export interface HistoryRow {
	symbol: string;
	onWatchlist: boolean;
	startDate: string | null;
	endDate: string | null;
	startPrice: number | null;
	endPrice: number | null;
	change: number | null;
	changePct: number | null;
	high: number | null;
	low: number | null;
}

export type AgentEvent =
	| { type: "tool_call"; name: string; args: unknown }
	| { type: "watchlist"; symbols: string[] }
	| { type: "history"; period: HistoryPeriod; from: string; rows: HistoryRow[] }
	| {
			type: "snapshots";
			asOf: string;
			market: MarketClock | null;
			rows: SnapshotRow[];
	  };

export interface ToolOutcome {
	result: unknown;
	events: AgentEvent[];
}

export interface Toolbox {
	execute(call: ToolCall): Promise<ToolOutcome>;
}

export interface ToolDeps {
	getWatchlist(): Promise<string[]>;
	addSymbols(symbols: string[]): Promise<SymbolResult<AddStatus>[]>;
	removeSymbols(symbols: string[]): Promise<SymbolResult<RemoveStatus>[]>;
	checkAsset(symbol: string): Promise<AssetCheck>;
	getSnapshots(symbols: string[]): Promise<MarketSnapshot[]>;
	getClock(): Promise<MarketClock>;
	getDailyBars(
		symbols: string[],
		start: string,
		end: string,
	): Promise<Record<string, DailyBar[]>>;
	now(): Date;
}

const symbolList = {
	type: "array",
	items: { type: "string" },
	minItems: 1,
	maxItems: WATCHLIST_CAP,
	description: "US stock or ETF ticker symbols, e.g. NET or BRK.B.",
};

export const TOOL_DEFINITIONS: ToolDefinition[] = [
	{
		name: "list_watchlist",
		description: "List the symbols currently on the user's watchlist.",
		parameters: { type: "object", properties: {} },
	},
	{
		name: "add_symbols",
		description: `Add symbols to the watchlist (max ${WATCHLIST_CAP}). Returns a status per symbol.`,
		parameters: {
			type: "object",
			properties: { symbols: symbolList },
			required: ["symbols"],
		},
	},
	{
		name: "remove_symbols",
		description:
			"Remove symbols from the watchlist. Returns a status per symbol.",
		parameters: {
			type: "object",
			properties: { symbols: symbolList },
			required: ["symbols"],
		},
	},
	{
		name: "get_snapshots",
		description:
			"Get the latest market snapshot for symbols (defaults to the whole watchlist). The user sees the results as a table.",
		parameters: { type: "object", properties: { symbols: symbolList } },
	},
	{
		name: "respond",
		description:
			"Give the user your final answer. Always finish by calling this exactly once.",
		parameters: {
			type: "object",
			properties: {
				symbols: {
					type: "array",
					items: { type: "string" },
					description: "The symbols your answer is about.",
				},
				prose: {
					type: "string",
					description: "Your answer in plain words, with no digits at all.",
				},
			},
			required: ["symbols", "prose"],
		},
	},
];

export function createToolbox(deps: ToolDeps): Toolbox {
	const handlers: Record<string, (args: unknown) => Promise<ToolOutcome>> = {
		list_watchlist: async () => ({
			result: { symbols: await deps.getWatchlist() },
			events: [],
		}),
		add_symbols: (args) => addSymbols(deps, args),
		remove_symbols: (args) => removeSymbols(deps, args),
		get_snapshots: (args) => getSnapshots(deps, args),
	};

	return {
		async execute({ name, arguments: args }) {
			const handler = handlers[name];
			if (!handler) {
				return { result: { error: "unknown_tool", tool: name }, events: [] };
			}
			try {
				return await handler(args);
			} catch (error) {
				if (error instanceof MarketDataError) {
					return {
						result: {
							error: error.code,
							message: "Market data is unavailable right now.",
						},
						events: [],
					};
				}
				throw error;
			}
		},
	};
}

async function addSymbols(deps: ToolDeps, args: unknown): Promise<ToolOutcome> {
	const symbols = readSymbols(args, { required: true });
	if (!symbols) return invalidArguments();

	const watchlist = await deps.getWatchlist();
	const results: (SymbolResult<AddToolStatus> | null)[] = [];
	const candidates: string[] = [];
	for (const raw of symbols) {
		const symbol = normalizeSymbol(raw);
		if (!symbol) {
			results.push({ symbol: raw.trim().toUpperCase(), status: "invalid" });
		} else if (watchlist.includes(symbol)) {
			results.push({ symbol, status: "already_present" });
		} else {
			const asset = await deps.checkAsset(symbol);
			if (asset.status === "valid") {
				candidates.push(symbol);
				results.push(null);
			} else {
				results.push({ symbol, status: asset.status });
			}
		}
	}

	const stored = candidates.length > 0 ? await deps.addSymbols(candidates) : [];
	const merged = results.map((result) => result ?? stored.shift());
	const changed = merged.some((result) => result?.status === "added");
	return {
		result: { results: merged },
		events: changed ? [await watchlistEvent(deps)] : [],
	};
}

async function removeSymbols(
	deps: ToolDeps,
	args: unknown,
): Promise<ToolOutcome> {
	const symbols = readSymbols(args, { required: true });
	if (!symbols) return invalidArguments();

	const results = await deps.removeSymbols(symbols.map(normalizeLoosely));
	const changed = results.some((result) => result.status === "removed");
	return {
		result: { results },
		events: changed ? [await watchlistEvent(deps)] : [],
	};
}

async function getSnapshots(
	deps: ToolDeps,
	args: unknown,
): Promise<ToolOutcome> {
	const requested = readSymbols(args, { required: false });
	if (requested === null) return invalidArguments();

	const watchlist = await deps.getWatchlist();
	const asOf = deps.now().toISOString();
	const symbols = requested
		? [...new Set(requested.map(normalizeLoosely))]
		: watchlist;

	const unavailable: AssetCheck[] = [];
	const lookup: string[] = [];
	for (const symbol of symbols) {
		if (!normalizeSymbol(symbol)) {
			unavailable.push({ symbol, status: "invalid" });
		} else if (watchlist.includes(symbol)) {
			lookup.push(symbol);
		} else {
			const asset = await deps.checkAsset(symbol);
			if (asset.status === "valid") lookup.push(symbol);
			else unavailable.push(asset);
		}
	}

	if (lookup.length === 0) {
		return {
			result: {
				asOf,
				rows: [],
				unavailable,
				note: symbols.length === 0 ? "The watchlist is empty." : undefined,
			},
			events: [],
		};
	}

	const [snapshots, market] = await Promise.all([
		deps.getSnapshots(lookup),
		readClock(deps),
	]);
	const rows = snapshots.map((row) => ({
		...row,
		onWatchlist: watchlist.includes(row.symbol),
	}));
	return {
		result: { asOf, market, rows, unavailable },
		events: [{ type: "snapshots", asOf, market, rows }],
	};
}

// The clock only labels the data, so losing it shouldn't lose the snapshots.
async function readClock(deps: ToolDeps): Promise<MarketClock | null> {
	try {
		return await deps.getClock();
	} catch (error) {
		if (error instanceof MarketDataError) return null;
		throw error;
	}
}

/**
 * Returns the `symbols` argument when valid, `undefined` when it is optional
 * and absent, and `null` when the arguments are unusable.
 */
function readSymbols(
	args: unknown,
	{ required }: { required: boolean },
): string[] | undefined | null {
	if (typeof args !== "object" || args === null || Array.isArray(args)) {
		return null;
	}
	const { symbols } = args as { symbols?: unknown };
	if (symbols === undefined) return required ? null : undefined;
	if (
		!Array.isArray(symbols) ||
		symbols.length === 0 ||
		symbols.length > WATCHLIST_CAP ||
		!symbols.every((symbol) => typeof symbol === "string")
	) {
		return null;
	}
	return symbols;
}

function invalidArguments(): ToolOutcome {
	return {
		result: {
			error: "invalid_arguments",
			message: `Pass "symbols" as a list of 1 to ${WATCHLIST_CAP} ticker strings.`,
		},
		events: [],
	};
}

function normalizeLoosely(raw: string): string {
	return normalizeSymbol(raw) ?? raw.trim().toUpperCase();
}

async function watchlistEvent(deps: ToolDeps): Promise<AgentEvent> {
	return { type: "watchlist", symbols: await deps.getWatchlist() };
}
