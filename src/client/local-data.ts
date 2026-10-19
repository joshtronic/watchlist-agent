const PREFIX = "watchlist:";

export function clearLocalData(storage: Storage): void {
	try {
		const keys: string[] = [];
		for (let i = 0; i < storage.length; i++) {
			const key = storage.key(i);
			if (key?.startsWith(PREFIX)) keys.push(key);
		}
		for (const key of keys) storage.removeItem(key);
	} catch {
		// Storage can be blocked (e.g. private browsing); nothing to clear.
	}
}
