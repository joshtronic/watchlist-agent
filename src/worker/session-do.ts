import { DurableObject } from "cloudflare:workers";

export interface SessionRecord {
	disclaimerAcceptedAt: number;
	lastActive: number;
	cookieIssuedAt: number;
}

export class SessionDO extends DurableObject<Env> {
	async ping(): Promise<string> {
		return "pong";
	}

	async create(_now: number): Promise<void> {
		throw new Error("Not implemented");
	}

	async get(): Promise<SessionRecord | null> {
		throw new Error("Not implemented");
	}

	async touch(_now: number): Promise<{ refreshCookie: boolean } | null> {
		throw new Error("Not implemented");
	}

	async destroy(): Promise<void> {
		throw new Error("Not implemented");
	}

	override async alarm(): Promise<void> {
		throw new Error("Not implemented");
	}
}
