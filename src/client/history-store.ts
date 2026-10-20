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

export type ChatEntry =
	| { kind: "user"; text: string; at: number }
	| { kind: "assistant"; text: string; at: number }
	| { kind: "snapshots"; asOf: string; rows: SnapshotRow[]; at: number }
	| { kind: "error"; code: string; at: number };

export function loadHistory(_storage: Storage): ChatEntry[] {
	throw new Error("Not implemented");
}

export function appendEntries(_storage: Storage, _entries: ChatEntry[]): void {
	throw new Error("Not implemented");
}

export function memoryBoundary(_entries: ChatEntry[]): number | null {
	throw new Error("Not implemented");
}
