import { describe, expect, it } from "vitest";
import { parseSse } from "../../src/client/sse";

function streamOf(...chunks: string[]) {
	const encoder = new TextEncoder();
	return new ReadableStream<Uint8Array>({
		start(controller) {
			for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
			controller.close();
		},
	});
}

async function collect(stream: ReadableStream<Uint8Array>) {
	const events = [];
	for await (const event of parseSse(stream)) events.push(event);
	return events;
}

describe("parseSse", () => {
	it("parses events with JSON data", async () => {
		const events = await collect(
			streamOf(
				'event: message\ndata: {"prose":"Hi"}\n\nevent: done\ndata: {}\n\n',
			),
		);

		expect(events).toEqual([
			{ event: "message", data: { prose: "Hi" } },
			{ event: "done", data: {} },
		]);
	});

	it("reassembles events split across chunks", async () => {
		const events = await collect(
			streamOf("event: mess", 'age\ndata: {"pro', 'se":"Hi"}\n', "\n"),
		);

		expect(events).toEqual([{ event: "message", data: { prose: "Hi" } }]);
	});

	it("ignores comment lines and an unfinished trailing event", async () => {
		const events = await collect(
			streamOf(": keep-alive\n\nevent: done\ndata: {}\n\nevent: message\n"),
		);

		expect(events).toEqual([{ event: "done", data: {} }]);
	});
});
