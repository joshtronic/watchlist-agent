import { DurableObject } from "cloudflare:workers";
import type { HistoryMessage } from "./agent/loop";
import {
	type AddStatus,
	normalizeSymbol,
	type RemoveStatus,
	STARTER_WATCHLIST,
	type SymbolResult,
	WATCHLIST_CAP,
} from "./watchlist";

const DAY_MS = 24 * 60 * 60 * 1000;
const INACTIVITY_WIPE_MS = 365 * DAY_MS;
const SESSION_KEY = "session";
const WATCHLIST_KEY = "watchlist";

export interface TurnRecord {
	user: string;
	assistant: string;
	at: number;
	offer: string[];
}

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
		return (await this.ctx.storage.get<string[]>(WATCHLIST_KEY)) ?? [];
	}

	async addSymbols(symbols: string[]): Promise<SymbolResult<AddStatus>[]> {
		const watchlist = await this.getWatchlist();
		const results = symbols.map((raw): SymbolResult<AddStatus> => {
			const symbol = normalizeSymbol(raw);
			if (!symbol) {
				return { symbol: raw.trim().toUpperCase(), status: "invalid" };
			}
			if (watchlist.includes(symbol)) {
				return { symbol, status: "already_present" };
			}
			if (watchlist.length >= WATCHLIST_CAP) {
				return { symbol, status: "cap_reached" };
			}
			watchlist.push(symbol);
			return { symbol, status: "added" };
		});

		if (results.some((result) => result.status === "added")) {
			await this.ctx.storage.put(WATCHLIST_KEY, watchlist);
		}
		return results;
	}

	async removeSymbols(
		symbols: string[],
	): Promise<SymbolResult<RemoveStatus>[]> {
		let watchlist = await this.getWatchlist();
		const results = symbols.map((raw): SymbolResult<RemoveStatus> => {
			const symbol = normalizeSymbol(raw) ?? raw.trim().toUpperCase();
			if (!watchlist.includes(symbol)) {
				return { symbol, status: "not_present" };
			}
			watchlist = watchlist.filter((existing) => existing !== symbol);
			return { symbol, status: "removed" };
		});

		if (results.some((result) => result.status === "removed")) {
			await this.ctx.storage.put(WATCHLIST_KEY, watchlist);
		}
		return results;
	}

	async applyStarter(): Promise<string[] | null> {
		if ((await this.getWatchlist()).length > 0) return null;

		const watchlist = [...STARTER_WATCHLIST];
		await this.ctx.storage.put(WATCHLIST_KEY, watchlist);
		return watchlist;
	}

	async getHistory(): Promise<HistoryMessage[]> {
		throw new Error("Not implemented");
	}

	async getPendingOffer(): Promise<string[]> {
		throw new Error("Not implemented");
	}

	async recordTurn(_turn: TurnRecord): Promise<void> {
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
