export const WATCHLIST_CAP = 10;

export const STARTER_WATCHLIST: readonly string[] = [];

export type AddStatus = "added" | "already_present" | "cap_reached" | "invalid";
export type RemoveStatus = "removed" | "not_present";

export interface SymbolResult<Status> {
	symbol: string;
	status: Status;
}

export function normalizeSymbol(_raw: string): string | null {
	throw new Error("Not implemented");
}
