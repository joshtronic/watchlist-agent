import type { SnapshotRow } from "./history-store";
import { parseSse } from "./sse";

export type ChatEvent =
	| { type: "tool_call"; name: string; args: unknown }
	| { type: "watchlist"; symbols: string[] }
	| { type: "snapshots"; asOf: string; rows: SnapshotRow[] }
	| { type: "message"; prose: string; symbols: string[] }
	| { type: "error"; code: string }
	| { type: "done" };

/**
 * Sends a chat message and reports the turn's events. Always finishes with a
 * `done` event, preceded by an `error` event if anything went wrong.
 */
export async function sendChat(
	message: string,
	onEvent: (event: ChatEvent) => void,
): Promise<void> {
	try {
		const res = await fetch("/api/chat", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ message }),
		});
		if (!res.ok || !res.body) {
			onEvent({ type: "error", code: await errorCode(res) });
			onEvent({ type: "done" });
			return;
		}

		for await (const { event, data } of parseSse(res.body)) {
			const chatEvent = { type: event, ...(data as object) } as ChatEvent;
			onEvent(chatEvent);
			if (chatEvent.type === "done") return;
		}
	} catch {
		// Fall through: the request or the stream failed.
	}
	onEvent({ type: "error", code: "network" });
	onEvent({ type: "done" });
}

async function errorCode(res: Response): Promise<string> {
	try {
		const body: { error?: unknown } = await res.json();
		return typeof body.error === "string" ? body.error : "unknown";
	} catch {
		return "unknown";
	}
}
