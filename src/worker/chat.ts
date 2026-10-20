import type { AiClient } from "./agent/ai-client";
import type { HistoryMessage } from "./agent/loop";
import type { Toolbox } from "./agent/tools";
import type { TurnRecord } from "./session-do";

export interface ChatTurnDeps {
	message: string;
	ai: AiClient;
	toolbox: Toolbox;
	history: HistoryMessage[];
	pendingOffer: string[];
	getWatchlist(): Promise<string[]>;
	recordTurn(turn: TurnRecord): Promise<void>;
	clearPendingOffer(): Promise<void>;
	now(): number;
}

export function encodeEvent(_event: string, _data: unknown): string {
	throw new Error("Not implemented");
}

export function streamChatTurn(
	_deps: ChatTurnDeps,
): ReadableStream<Uint8Array> {
	throw new Error("Not implemented");
}
