export interface SseEvent {
	event: string;
	data: unknown;
}

/** Yields complete server-sent events from a byte stream. */
export async function* parseSse(
	stream: ReadableStream<Uint8Array>,
): AsyncGenerator<SseEvent> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	while (true) {
		const { value, done } = await reader.read();
		if (done) return;
		buffer += decoder.decode(value, { stream: true });

		let end = buffer.indexOf("\n\n");
		while (end !== -1) {
			const event = parseBlock(buffer.slice(0, end));
			buffer = buffer.slice(end + 2);
			if (event) yield event;
			end = buffer.indexOf("\n\n");
		}
	}
}

function parseBlock(block: string): SseEvent | null {
	let event = "message";
	let data = "";
	for (const line of block.split("\n")) {
		if (line.startsWith(":")) continue;
		if (line.startsWith("event: ")) event = line.slice(7);
		else if (line.startsWith("data: ")) data += line.slice(6);
	}
	if (!data) return null;
	try {
		return { event, data: JSON.parse(data) };
	} catch {
		return null;
	}
}
