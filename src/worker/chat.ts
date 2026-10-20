import type { AiClient } from "./agent/ai-client";
import { type HistoryMessage, runAgentTurn } from "./agent/loop";
import type { AgentEvent, Toolbox } from "./agent/tools";
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

export function encodeEvent(event: string, data: unknown): string {
	return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** Runs one chat turn, streaming its events as server-sent events. */
export function streamChatTurn(deps: ChatTurnDeps): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	return new ReadableStream({
		async start(controller) {
			const send = (event: string, data: unknown) =>
				controller.enqueue(encoder.encode(encodeEvent(event, data)));
			const emit = ({ type, ...data }: AgentEvent) => send(type, data);

			try {
				const result = await runAgentTurn({
					ai: deps.ai,
					toolbox: deps.toolbox,
					history: deps.history,
					pendingOffer: deps.pendingOffer,
					message: deps.message,
					emit,
					getWatchlist: deps.getWatchlist,
				});

				if (result.ok) {
					send("message", { prose: result.prose, symbols: result.symbols });
					await deps.recordTurn({
						user: deps.message,
						assistant: result.prose,
						at: deps.now(),
						offer: result.offer,
					});
				} else {
					// An offer is only good for the next message, answered or not.
					await deps.clearPendingOffer();
					send("error", { code: result.error });
				}
			} catch (error) {
				console.error("chat turn failed", error);
				send("error", { code: "internal_error" });
			}

			send("done", {});
			controller.close();
		},
	});
}
