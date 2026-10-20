import type { SnapshotRow } from "./history-store";

export type ChatEvent =
	| { type: "tool_call"; name: string; args: unknown }
	| { type: "watchlist"; symbols: string[] }
	| { type: "snapshots"; asOf: string; rows: SnapshotRow[] }
	| { type: "message"; prose: string; symbols: string[] }
	| { type: "error"; code: string }
	| { type: "done" };

export async function sendChat(
	_message: string,
	_onEvent: (event: ChatEvent) => void,
): Promise<void> {
	throw new Error("Not implemented");
}
