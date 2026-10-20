import { describe, expect, it, vi } from "vitest";
import { AiError, type AiReply } from "../../src/worker/agent/ai-client";
import type { ChatTurnDeps } from "../../src/worker/chat";
import { encodeEvent, streamChatTurn } from "../../src/worker/chat";

const respond = (prose: string, symbols: string[] = []): AiReply => ({
	text: null,
	toolCalls: [{ name: "respond", arguments: { prose, symbols } }],
});

async function readEvents(stream: ReadableStream<Uint8Array>) {
	const text = await new Response(stream).text();
	return text
		.split("\n\n")
		.filter(Boolean)
		.map((block) => {
			const [eventLine, dataLine] = block.split("\n");
			return {
				event: eventLine?.replace("event: ", ""),
				data: JSON.parse(dataLine?.replace("data: ", "") ?? "null"),
			};
		});
}

function deps(
	replies: (AiReply | Error)[],
	overrides: Partial<ChatTurnDeps> = {},
): ChatTurnDeps {
	return {
		message: "How's NET?",
		ai: vi.fn(async () => {
			const reply = replies.shift();
			if (!reply || reply instanceof Error) throw reply ?? new Error("done");
			return reply;
		}),
		toolbox: {
			execute: vi.fn(async () => ({
				result: { symbols: ["NET"] },
				events: [{ type: "watchlist" as const, symbols: ["NET"] }],
			})),
		},
		history: [],
		pendingOffer: [],
		getWatchlist: async () => ["NET"],
		recordTurn: vi.fn(async () => {}),
		clearPendingOffer: vi.fn(async () => {}),
		now: () => 1234,
		...overrides,
	};
}

describe("encodeEvent", () => {
	it("formats a server-sent event with a JSON payload", () => {
		expect(encodeEvent("message", { prose: "Hi" })).toBe(
			'event: message\ndata: {"prose":"Hi"}\n\n',
		);
	});
});

describe("streamChatTurn", () => {
	it("sends news labels before the answer", async () => {
		const d = deps([], {
			ai: vi.fn(async () => respond("Upbeat.", ["AMD"])),
		});
		const labelled = {
			...d,
			ai: vi
				.fn()
				.mockResolvedValueOnce({
					text: null,
					toolCalls: [{ name: "get_news", arguments: {} }],
				})
				.mockResolvedValueOnce({
					text: null,
					toolCalls: [
						{
							name: "respond",
							arguments: {
								prose: "Upbeat.",
								symbols: ["AMD"],
								newsLabels: [{ id: 7, sentiment: "positive", kind: "news" }],
							},
						},
					],
				}),
			toolbox: {
				execute: vi.fn(async () => ({
					result: {},
					events: [
						{
							type: "news" as const,
							articles: [
								{
									id: 7,
									headline: "AMD rallies",
									summary: "",
									source: "benzinga",
									url: "https://example.com/7",
									symbols: ["AMD"],
									createdAt: "2026-10-19T16:31:00Z",
								},
							],
						},
					],
				})),
			},
		};

		const events = await readEvents(streamChatTurn(labelled));

		expect(events.map((e) => e.event)).toEqual([
			"tool_call",
			"news",
			"news_labels",
			"message",
			"done",
		]);
		expect(events[2]?.data).toEqual({
			labels: [{ id: 7, sentiment: "positive", kind: "news" }],
		});
	});

	it("streams tool activity, the answer, then done", async () => {
		const d = deps([
			{ text: null, toolCalls: [{ name: "list_watchlist", arguments: {} }] },
			respond("You're watching NET.", ["NET"]),
		]);

		const events = await readEvents(streamChatTurn(d));

		expect(events).toEqual([
			{ event: "tool_call", data: { name: "list_watchlist", args: {} } },
			{ event: "watchlist", data: { symbols: ["NET"] } },
			{
				event: "message",
				data: { prose: "You're watching NET.", symbols: ["NET"] },
			},
			{ event: "done", data: {} },
		]);
	});

	it("remembers the exchange and the new offer", async () => {
		const d = deps([respond("SNOW looks busy. Want me to add it?", ["SNOW"])]);

		await readEvents(streamChatTurn(d));

		expect(d.recordTurn).toHaveBeenCalledWith({
			user: "How's NET?",
			assistant: "SNOW looks busy. Want me to add it?",
			at: 1234,
			offer: ["SNOW"],
		});
		expect(d.clearPendingOffer).not.toHaveBeenCalled();
	});

	it("reports a failed turn without remembering it, and expires the offer", async () => {
		const d = deps([new AiError("ai_quota_exhausted", "4006")]);

		const events = await readEvents(streamChatTurn(d));

		expect(events).toEqual([
			{ event: "error", data: { code: "ai_quota_exhausted" } },
			{ event: "done", data: {} },
		]);
		expect(d.recordTurn).not.toHaveBeenCalled();
		expect(d.clearPendingOffer).toHaveBeenCalledOnce();
	});

	it("reports an unexpected failure and still finishes the stream", async () => {
		const d = deps(
			[{ text: null, toolCalls: [{ name: "list_watchlist", arguments: {} }] }],
			{
				toolbox: {
					execute: vi.fn(async () => {
						throw new Error("storage exploded");
					}),
				},
			},
		);

		const events = await readEvents(streamChatTurn(d));

		expect(events.slice(-2)).toEqual([
			{ event: "error", data: { code: "internal_error" } },
			{ event: "done", data: {} },
		]);
	});
});
