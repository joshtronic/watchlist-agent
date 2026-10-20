export interface WatchlistCardOptions {
	watchlist: string[];
	onStart: () => Promise<string[] | null>;
	onRefresh: () => void;
}

export function mountWatchlistCard(
	_container: HTMLElement,
	_options: WatchlistCardOptions,
): void {
	throw new Error("Not implemented");
}
