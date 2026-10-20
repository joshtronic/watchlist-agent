export interface SseEvent {
	event: string;
	data: unknown;
}

export function parseSse(
	_stream: ReadableStream<Uint8Array>,
): AsyncGenerator<SseEvent> {
	throw new Error("Not implemented");
}
