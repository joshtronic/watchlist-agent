export const WATCHLIST_CAP = 10;

// QQQ's top holdings (GOOG dropped in favour of SPCX), as of 2026-10-19.
export const STARTER_WATCHLIST: readonly string[] = [
	"NVDA",
	"AAPL",
	"MSFT",
	"MU",
	"AMZN",
	"AMD",
	"META",
	"GOOGL",
	"TSLA",
	"SPCX",
];

export type AddStatus = "added" | "already_present" | "cap_reached" | "invalid";
export type RemoveStatus = "removed" | "not_present";

export interface SymbolResult<Status> {
	symbol: string;
	status: Status;
}

// 1-5 letters with an optional share-class suffix, e.g. BRK.B.
const SYMBOL_PATTERN = /^[A-Z]{1,5}(\.[A-Z])?$/;

export function normalizeSymbol(raw: string): string | null {
	const symbol = raw.trim().toUpperCase();
	return SYMBOL_PATTERN.test(symbol) ? symbol : null;
}
