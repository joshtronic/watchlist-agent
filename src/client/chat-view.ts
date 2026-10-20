import type { ChatEntry } from "./history-store";

export function renderTranscript(
	_container: HTMLElement,
	_entries: ChatEntry[],
	_boundary: number | null,
): void {
	throw new Error("Not implemented");
}

export function chatErrorMessage(_code: string): string {
	throw new Error("Not implemented");
}

export function describeToolCall(_name: string, _args: unknown): string {
	throw new Error("Not implemented");
}
