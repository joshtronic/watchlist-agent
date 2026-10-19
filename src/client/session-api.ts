export interface Config {
	turnstileSiteKey: string;
}

export type SessionState =
	| { kind: "active"; watchlist: string[] }
	| { kind: "anonymous" };

export type CreateSessionResult =
	| { ok: true; watchlist: string[] }
	| { ok: false; error: string };

export async function getConfig(): Promise<Config> {
	const res = await fetch("/api/config");
	if (!res.ok) throw new Error(`Config request failed: ${res.status}`);
	return res.json();
}

export async function getSession(): Promise<SessionState> {
	const res = await fetch("/api/session");
	if (res.status === 401) return { kind: "anonymous" };
	if (!res.ok) throw new Error(`Session request failed: ${res.status}`);

	const { watchlist }: { watchlist: string[] } = await res.json();
	return { kind: "active", watchlist };
}

export async function createSession(
	token: string,
): Promise<CreateSessionResult> {
	let res: Response;
	try {
		res = await fetch("/api/session", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ turnstileToken: token, acceptedDisclaimer: true }),
		});
	} catch {
		return { ok: false, error: "network" };
	}

	if (!res.ok) return { ok: false, error: await errorCode(res) };

	const { watchlist }: { watchlist: string[] } = await res.json();
	return { ok: true, watchlist };
}

export async function logout(): Promise<boolean> {
	try {
		const res = await fetch("/api/session", { method: "DELETE" });
		return res.ok;
	} catch {
		return false;
	}
}

async function errorCode(res: Response): Promise<string> {
	try {
		const body: { error?: unknown } = await res.json();
		return typeof body.error === "string" ? body.error : "unknown";
	} catch {
		return "unknown";
	}
}
