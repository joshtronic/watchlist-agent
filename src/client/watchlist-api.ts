export async function applyStarter(): Promise<string[] | null> {
	try {
		const res = await fetch("/api/watchlist/starter", { method: "POST" });
		if (!res.ok) return null;

		const { watchlist }: { watchlist: string[] } = await res.json();
		return watchlist;
	} catch {
		return null;
	}
}
