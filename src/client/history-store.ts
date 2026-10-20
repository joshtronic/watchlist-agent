export interface SnapshotRow {
	symbol: string;
	price: number | null;
	tradeTime: string | null;
	prevClose: number | null;
	change: number | null;
	changePct: number | null;
	dayOpen: number | null;
	dayHigh: number | null;
	dayLow: number | null;
	dayVolume: number | null;
	bid: number | null;
	ask: number | null;
	onWatchlist: boolean;
}

export interface MarketClock {
	isOpen: boolean;
	timestamp: string;
	nextOpen: string;
	nextClose: string;
}

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

export interface NewsArticle {
	id: number;
	headline: string;
	summary: string;
	source: string;
	url: string;
	symbols: string[];
	createdAt: string;
}

export interface NewsLabel {
	id: number;
	sentiment: string;
	kind: string;
}

export type ChatEntry =
	| { kind: "user"; text: string; at: number }
	| { kind: "assistant"; text: string; at: number }
	| {
			kind: "snapshots";
			asOf: string;
			market?: MarketClock | null;
			rows: SnapshotRow[];
			at: number;
	  }
	| {
			kind: "history";
			period: string;
			from: string;
			rows: HistoryRow[];
			at: number;
	  }
	| { kind: "news"; articles: NewsArticle[]; labels: NewsLabel[]; at: number }
	| { kind: "error"; code: string; at: number };

const KEY = "watchlist:history";
const LIMIT = 200;
// The server remembers the last ten exchanges.
const REMEMBERED_EXCHANGES = 10;

export function loadHistory(storage: Storage): ChatEntry[] {
	try {
		const parsed: unknown = JSON.parse(storage.getItem(KEY) ?? "[]");
		return Array.isArray(parsed) ? (parsed as ChatEntry[]) : [];
	} catch {
		return [];
	}
}

export function appendEntries(storage: Storage, entries: ChatEntry[]): void {
	try {
		const history = [...loadHistory(storage), ...entries].slice(-LIMIT);
		storage.setItem(KEY, JSON.stringify(history));
	} catch {
		// Storage can be blocked or full; the transcript just won't persist.
	}
}

/**
 * Index of the first entry the assistant still remembers, or null when it
 * remembers everything shown. Failed turns aren't remembered, so this counts
 * answered exchanges back from the end.
 */
export function saveHistory(storage: Storage, entries: ChatEntry[]): void {
	try {
		storage.setItem(KEY, JSON.stringify(entries.slice(-LIMIT)));
	} catch {
		// Storage can be blocked or full; the transcript just won't persist.
	}
}

export function memoryBoundary(entries: ChatEntry[]): number | null {
	let answers = 0;
	for (let i = entries.length - 1; i >= 0; i--) {
		if (entries[i]?.kind !== "assistant") continue;
		answers += 1;
		if (answers === REMEMBERED_EXCHANGES) {
			const hasOlder = entries
				.slice(0, i)
				.some((entry) => entry.kind === "assistant");
			if (!hasOlder) return null;
			let start = i;
			while (start > 0 && entries[start]?.kind !== "user") start -= 1;
			return start;
		}
	}
	return null;
}
