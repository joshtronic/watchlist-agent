import type { AiClient } from "./ai-client";
import type { AgentEvent, Toolbox } from "./tools";

export const MAX_ITERATIONS = 5;

export interface HistoryMessage {
	role: "user" | "assistant";
	text: string;
	at: number;
}

export interface TurnInput {
	ai: AiClient;
	toolbox: Toolbox;
	history: HistoryMessage[];
	pendingOffer: string[];
	message: string;
	emit(event: AgentEvent): void;
	getWatchlist(): Promise<string[]>;
}

export type TurnResult =
	| { ok: true; prose: string; symbols: string[]; offer: string[] }
	| { ok: false; error: "loop_limit" | "ai_error" | "ai_quota_exhausted" };

export function buildSystemPrompt(_pendingOffer: string[]): string {
	throw new Error("Not implemented");
}

export async function runAgentTurn(_input: TurnInput): Promise<TurnResult> {
	throw new Error("Not implemented");
}
