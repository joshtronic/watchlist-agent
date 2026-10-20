import {
	type AssetCheck,
	type DailyBar,
	type MarketClock,
	MarketDataError,
	type MarketSnapshot,
	type NewsArticle,
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

export const HISTORY_PERIODS = ["1w", "1m", "3m", "6m", "ytd", "1y"] as const;
export type HistoryPeriod = (typeof HISTORY_PERIODS)[number];

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

export const NEWS_SENTIMENTS = ["positive", "negative", "neutral"] as const;
export const NEWS_KINDS = [
	"news",
	"analysis",
	"analyst_rating",
	"opinion",
	"press_release",
] as const;

export interface NewsLabel {
	id: number;
	sentiment: (typeof NEWS_SENTIMENTS)[number];
	kind: (typeof NEWS_KINDS)[number];
}

export type AgentEvent =
	| { type: "tool_call"; name: string; args: unknown }
	| { type: "watchlist"; symbols: string[] }
	| { type: "news"; articles: NewsArticle[] }
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
	getNews(symbols: string[], limit: number): Promise<NewsArticle[]>;
	getDailyBars(
		symbols: string[],
		start: string,
		end: string,
	): Promise<Record<string, DailyBar[]>>;
	now(): Date;
}

const DEFAULT_NEWS = 5;
const MAX_NEWS = 10;

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
		name: "get_price_history",
		description:
			"Get how symbols' prices changed over a period (defaults to the whole watchlist): the starting and ending price, the change, and the period's high and low, from daily closing prices across all US exchanges, delayed at least fifteen minutes. The user sees the results as a table.",
		parameters: {
			type: "object",
			properties: {
				period: {
					type: "string",
					enum: [...HISTORY_PERIODS],
					description:
						"1w = past week, 1m = past month, 3m = past three months, 6m = past six months, ytd = year to date, 1y = past year.",
				},
				symbols: symbolList,
			},
			required: ["period"],
		},
	},
	{
		name: "get_news",
		description:
			"Get the latest news headlines for symbols (defaults to the whole watchlist), newest first, from Benzinga. The user sees them as cards; label each one in respond.",
		parameters: {
			type: "object",
			properties: {
				symbols: symbolList,
				limit: {
					type: "integer",
					minimum: 1,
					maximum: MAX_NEWS,
					description: `How many headlines to fetch (default ${DEFAULT_NEWS}).`,
				},
			},
		},
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
				newsLabels: {
					type: "array",
					description:
						"When you fetched news this turn, one label per headline: its id, its sentiment and what kind of article it is.",
					items: {
						type: "object",
						properties: {
							id: { type: "integer" },
							sentiment: { type: "string", enum: [...NEWS_SENTIMENTS] },
							kind: { type: "string", enum: [...NEWS_KINDS] },
						},
						required: ["id", "sentiment", "kind"],
					},
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
		get_price_history: (args) => getPriceHistory(deps, args),
		get_news: (args) => getNews(deps, args),
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

	const asOf = deps.now().toISOString();
	const { watchlist, symbols, lookup, unavailable } = await resolveLookup(
		deps,
		requested,
	);

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

// Enough for the model to judge tone without flooding its context.
const SUMMARY_LIMIT = 400;

async function getNews(deps: ToolDeps, args: unknown): Promise<ToolOutcome> {
	const requested = readSymbols(args, { required: false });
	const limit = (args as { limit?: unknown } | null)?.limit ?? DEFAULT_NEWS;
	if (
		requested === null ||
		typeof limit !== "number" ||
		!Number.isInteger(limit) ||
		limit < 1 ||
		limit > MAX_NEWS
	) {
		return invalidArguments();
	}

	const { lookup, unavailable } = await resolveLookup(deps, requested);
	if (lookup.length === 0) {
		return { result: { articles: [], unavailable }, events: [] };
	}

	const articles = await deps.getNews(lookup, limit);
	return {
		result: {
			articles: articles.map(({ url: _url, ...article }) => ({
				...article,
				summary: shorten(article.summary, SUMMARY_LIMIT),
			})),
			unavailable,
		},
		events: [{ type: "news", articles }],
	};
}

function shorten(text: string, limit: number): string {
	return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

const DAY_MS = 24 * 60 * 60 * 1000;
// SIP history is free once it is at least fifteen minutes old.
const SIP_DELAY_MS = 16 * 60 * 1000;
// Fetch a little before the period so the last earlier close is available.
const BASELINE_LOOKBACK_DAYS = 10;

async function getPriceHistory(
	deps: ToolDeps,
	args: unknown,
): Promise<ToolOutcome> {
	const period = (args as { period?: unknown } | null)?.period;
	const requested = readSymbols(args, { required: false });
	if (
		requested === null ||
		!HISTORY_PERIODS.includes(period as HistoryPeriod)
	) {
		return invalidArguments();
	}

	const now = deps.now();
	const from = periodStart(period as HistoryPeriod, now);
	const { watchlist, lookup, unavailable } = await resolveLookup(
		deps,
		requested,
	);
	if (lookup.length === 0) {
		return { result: { period, from, rows: [], unavailable }, events: [] };
	}

	const fetchFrom = new Date(
		new Date(`${from}T00:00:00Z`).getTime() - BASELINE_LOOKBACK_DAYS * DAY_MS,
	);
	const bars = await deps.getDailyBars(
		lookup,
		fetchFrom.toISOString(),
		new Date(now.getTime() - SIP_DELAY_MS).toISOString(),
	);
	const rows = lookup.map((symbol) =>
		historyRow(symbol, watchlist.includes(symbol), bars[symbol] ?? [], from),
	);
	return {
		result: { period, from, rows, unavailable },
		events: [{ type: "history", period: period as HistoryPeriod, from, rows }],
	};
}

function periodStart(period: HistoryPeriod, now: Date): string {
	const date = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
	);
	switch (period) {
		case "1w":
			date.setUTCDate(date.getUTCDate() - 7);
			break;
		case "1m":
			date.setUTCMonth(date.getUTCMonth() - 1);
			break;
		case "3m":
			date.setUTCMonth(date.getUTCMonth() - 3);
			break;
		case "6m":
			date.setUTCMonth(date.getUTCMonth() - 6);
			break;
		case "ytd":
			date.setUTCMonth(0, 1);
			break;
		case "1y":
			date.setUTCFullYear(date.getUTCFullYear() - 1);
			break;
	}
	return date.toISOString().slice(0, 10);
}

/**
 * The change is measured from the last close before the period (falling back
 * to the first open in it) to the latest close.
 */
function historyRow(
	symbol: string,
	onWatchlist: boolean,
	bars: DailyBar[],
	from: string,
): HistoryRow {
	const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
	const inPeriod = sorted.filter((bar) => bar.date >= from);
	const baseline = sorted.filter((bar) => bar.date < from).at(-1);
	const first = inPeriod[0];
	const last = inPeriod.at(-1);
	if (!first || !last) {
		return {
			symbol,
			onWatchlist,
			startDate: null,
			endDate: null,
			startPrice: null,
			endPrice: null,
			change: null,
			changePct: null,
			high: null,
			low: null,
		};
	}

	const startPrice = baseline?.close ?? first.open;
	const change = last.close - startPrice;
	return {
		symbol,
		onWatchlist,
		startDate: baseline?.date ?? first.date,
		endDate: last.date,
		startPrice,
		endPrice: last.close,
		change,
		changePct: startPrice ? (change / startPrice) * 100 : null,
		high: Math.max(...inPeriod.map((bar) => bar.high)),
		low: Math.min(...inPeriod.map((bar) => bar.low)),
	};
}

/**
 * Splits requested symbols (or the whole watchlist) into those to look up and
 * those that are unavailable. Off-list symbols are checked with the market.
 */
async function resolveLookup(deps: ToolDeps, requested: string[] | undefined) {
	const watchlist = await deps.getWatchlist();
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
	return { watchlist, symbols, lookup, unavailable };
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
