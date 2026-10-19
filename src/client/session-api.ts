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
	throw new Error("Not implemented");
}

export async function getSession(): Promise<SessionState> {
	throw new Error("Not implemented");
}

export async function createSession(
	_token: string,
): Promise<CreateSessionResult> {
	throw new Error("Not implemented");
}

export async function logout(): Promise<boolean> {
	throw new Error("Not implemented");
}
