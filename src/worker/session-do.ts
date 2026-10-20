import { DurableObject } from "cloudflare:workers";
import type { AddStatus, RemoveStatus, SymbolResult } from "./watchlist";

const DAY_MS = 24 * 60 * 60 * 1000;
const INACTIVITY_WIPE_MS = 365 * DAY_MS;
const SESSION_KEY = "session";

export interface SessionRecord {
	disclaimerAcceptedAt: number;
	lastActive: number;
	cookieIssuedAt: number;
}

export class SessionDO extends DurableObject<Env> {
	async create(now: number): Promise<void> {
		if (await this.get()) return;

		await this.save({
			disclaimerAcceptedAt: now,
			lastActive: now,
			cookieIssuedAt: now,
		});
	}

	async get(): Promise<SessionRecord | null> {
		return (await this.ctx.storage.get<SessionRecord>(SESSION_KEY)) ?? null;
	}

	async touch(now: number): Promise<{ refreshCookie: boolean } | null> {
		const session = await this.get();
		if (!session) return null;

		const refreshCookie = now - session.cookieIssuedAt >= DAY_MS;
		await this.save({
			...session,
			lastActive: now,
			cookieIssuedAt: refreshCookie ? now : session.cookieIssuedAt,
		});
		return { refreshCookie };
	}

	async destroy(): Promise<void> {
		await this.ctx.storage.deleteAlarm();
		await this.ctx.storage.deleteAll();
	}

	async getWatchlist(): Promise<string[]> {
		throw new Error("Not implemented");
	}

	async addSymbols(_symbols: string[]): Promise<SymbolResult<AddStatus>[]> {
		throw new Error("Not implemented");
	}

	async removeSymbols(
		_symbols: string[],
	): Promise<SymbolResult<RemoveStatus>[]> {
		throw new Error("Not implemented");
	}

	async applyStarter(): Promise<string[] | null> {
		throw new Error("Not implemented");
	}

	override async alarm(): Promise<void> {
		await this.ctx.storage.deleteAll();
	}

	private async save(session: SessionRecord): Promise<void> {
		await this.ctx.storage.put(SESSION_KEY, session);
		await this.ctx.storage.setAlarm(session.lastActive + INACTIVITY_WIPE_MS);
	}
}
