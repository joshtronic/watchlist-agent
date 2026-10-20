import { afterEach, describe, expect, it, vi } from "vitest";
import { type ChatEvent, sendChat } from "../../src/client/chat-api";

function sseResponse(body: string) {
	return new Response(body, {
		headers: { "content-type": "text/event-stream" },
	});
}

function mockFetch(response: Response | Error) {
	return vi
		.spyOn(globalThis, "fetch")
		.mockImplementation(async () =>
			response instanceof Error ? Promise.reject(response) : response,
		);
}

async function send(message: string) {
	const events: ChatEvent[] = [];
	await sendChat(message, (event) => events.push(event));
	return events;
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("sendChat", () => {
	it("posts the message as JSON", async () => {
		const spy = mockFetch(sseResponse("event: done\ndata: {}\n\n"));

		await send("How's NET?");

		const [url, init] = spy.mock.calls[0] ?? [];
		expect(String(url)).toBe("/api/chat");
		expect(init?.method).toBe("POST");
		expect(JSON.parse(String(init?.body))).toEqual({ message: "How's NET?" });
	});

	it("delivers streamed events in order", async () => {
		mockFetch(
			sseResponse(
				'event: tool_call\ndata: {"name":"get_snapshots","args":{}}\n\n' +
					'event: message\ndata: {"prose":"Up today.","symbols":[]}\n\n' +
					"event: done\ndata: {}\n\n",
			),
		);

		expect(await send("hi")).toEqual([
			{ type: "tool_call", name: "get_snapshots", args: {} },
			{ type: "message", prose: "Up today.", symbols: [] },
			{ type: "done" },
		]);
	});

	it("turns an error response into an error event", async () => {
		mockFetch(Response.json({ error: "rate_limited" }, { status: 429 }));

		expect(await send("hi")).toEqual([
			{ type: "error", code: "rate_limited" },
			{ type: "done" },
		]);
	});

	it("reports a failed request as a network error", async () => {
		mockFetch(new TypeError("Failed to fetch"));

		expect(await send("hi")).toEqual([
			{ type: "error", code: "network" },
			{ type: "done" },
		]);
	});

	it("reports a stream that ends early as a network error", async () => {
		mockFetch(
			sseResponse(
				'event: tool_call\ndata: {"name":"list_watchlist","args":{}}\n\n',
			),
		);

		expect(await send("hi")).toEqual([
			{ type: "tool_call", name: "list_watchlist", args: {} },
			{ type: "error", code: "network" },
			{ type: "done" },
		]);
	});
});
