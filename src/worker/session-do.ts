import { DurableObject } from "cloudflare:workers";
import {
	type AiClient,
	type AiRunner,
	createAiClient,
} from "./agent/ai-client";
import type { HistoryMessage } from "./agent/loop";
import { createToolbox } from "./agent/tools";
import { alpacaConfig, checkAsset, getSnapshots } from "./alpaca";
import { streamChatTurn } from "./chat";
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
const HISTORY_KEY = "history";
const PENDING_OFFER_KEY = "pendingOffer";
// The last ten exchanges, as user and assistant messages.
const HISTORY_LIMIT = 20;

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
	// Overridable so tests can substitute a fake model.
	aiClient = (): AiClient => createAiClient(this.env.AI as unknown as AiRunner);

	// Chat turns run one at a time per session, so two tabs (or a double
	// submit) can't interleave changes to the watchlist and history.
	private turnQueue: Promise<unknown> = Promise.resolve();

	async chat(message: string): Promise<ReadableStream<Uint8Array>> {
		const ready = this.turnQueue;
		let finished!: () => void;
		this.turnQueue = new Promise<void>((resolve) => {
			finished = resolve;
		});
		await ready;

		const market = alpacaConfig(this.env);
		const stream = streamChatTurn({
			message,
			ai: this.aiClient(),
			toolbox: createToolbox({
				getWatchlist: () => this.getWatchlist(),
				addSymbols: (symbols) => this.addSymbols(symbols),
				removeSymbols: (symbols) => this.removeSymbols(symbols),
				checkAsset: (symbol) => checkAsset(market, symbol),
				getSnapshots: (symbols) => getSnapshots(market, symbols),
				now: () => new Date(),
			}),
			history: await this.getHistory(),
			pendingOffer: await this.getPendingOffer(),
			getWatchlist: () => this.getWatchlist(),
			recordTurn: (turn) => this.recordTurn(turn),
			clearPendingOffer: () => this.clearPendingOffer(),
			now: () => Date.now(),
		});

		// Release the queue once the turn has streamed to the end.
		const [forClient, forQueue] = stream.tee();
		forQueue.pipeTo(new WritableStream()).finally(finished);
		return forClient;
	}

	async clearPendingOffer(): Promise<void> {
		await this.ctx.storage.delete(PENDING_OFFER_KEY);
	}

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
		return (await this.ctx.storage.get<HistoryMessage[]>(HISTORY_KEY)) ?? [];
	}

	async getPendingOffer(): Promise<string[]> {
		return (await this.ctx.storage.get<string[]>(PENDING_OFFER_KEY)) ?? [];
	}

	async recordTurn({ user, assistant, at, offer }: TurnRecord): Promise<void> {
		const history = [
			...(await this.getHistory()),
			{ role: "user" as const, text: user, at },
			{ role: "assistant" as const, text: assistant, at },
		].slice(-HISTORY_LIMIT);

		await this.ctx.storage.put({
			[HISTORY_KEY]: history,
			[PENDING_OFFER_KEY]: offer,
		});
	}

	override async alarm(): Promise<void> {
		await this.ctx.storage.deleteAll();
	}

	private async save(session: SessionRecord): Promise<void> {
		await this.ctx.storage.put(SESSION_KEY, session);
		await this.ctx.storage.setAlarm(session.lastActive + INACTIVITY_WIPE_MS);
	}
}
