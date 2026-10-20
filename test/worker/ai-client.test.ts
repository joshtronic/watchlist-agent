import { describe, expect, it, vi } from "vitest";
import {
	AiError,
	CHAT_MODEL,
	createAiClient,
} from "../../src/worker/agent/ai-client";

const tools = [
	{
		name: "list_watchlist",
		description: "List the watchlist.",
		parameters: { type: "object", properties: {} },
	},
];
const messages = [{ role: "user" as const, content: "hi" }];

function fakeAi(reply: unknown) {
	return { run: vi.fn(async () => reply) };
}

describe("createAiClient", () => {
	it("calls the chat model with the messages and function tools", async () => {
		const ai = fakeAi({ response: "hello" });

		await createAiClient(ai)(messages, tools);

		expect(ai.run).toHaveBeenCalledWith(CHAT_MODEL, {
			messages,
			tools: [{ type: "function", function: tools[0] }],
		});
	});

	it("returns plain text replies", async () => {
		const reply = await createAiClient(fakeAi({ response: "hello" }))(
			messages,
			tools,
		);

		expect(reply).toEqual({ text: "hello", toolCalls: [] });
	});

	it("treats an empty response as no text", async () => {
		const reply = await createAiClient(
			fakeAi({ response: "", tool_calls: [] }),
		)(messages, tools);

		expect(reply).toEqual({ text: null, toolCalls: [] });
	});

	it("returns tool calls with object arguments", async () => {
		const reply = await createAiClient(
			fakeAi({
				response: null,
				tool_calls: [{ name: "add_symbols", arguments: { symbols: ["NET"] } }],
			}),
		)(messages, tools);

		expect(reply).toEqual({
			text: null,
			toolCalls: [{ name: "add_symbols", arguments: { symbols: ["NET"] } }],
		});
	});

	it("parses tool call arguments sent as a JSON string", async () => {
		const reply = await createAiClient(
			fakeAi({
				tool_calls: [{ name: "add_symbols", arguments: '{"symbols":["NET"]}' }],
			}),
		)(messages, tools);

		expect(reply.toolCalls).toEqual([
			{ name: "add_symbols", arguments: { symbols: ["NET"] } },
		]);
	});

	it("accepts OpenAI-style tool calls", async () => {
		const reply = await createAiClient(
			fakeAi({
				tool_calls: [
					{
						id: "call_1",
						type: "function",
						function: { name: "list_watchlist", arguments: "{}" },
					},
				],
			}),
		)(messages, tools);

		expect(reply.toolCalls).toEqual([
			{ name: "list_watchlist", arguments: {} },
		]);
	});

	it("passes unparseable arguments through for validation to reject", async () => {
		const reply = await createAiClient(
			fakeAi({ tool_calls: [{ name: "add_symbols", arguments: "{oops" }] }),
		)(messages, tools);

		expect(reply.toolCalls).toEqual([
			{ name: "add_symbols", arguments: "{oops" },
		]);
	});

	it("reports the daily neuron allocation running out as quota exhausted", async () => {
		const ai = {
			run: vi.fn(async () => {
				throw new Error(
					"4006: you have used up your daily free allocation of 10,000 neurons",
				);
			}),
		};

		const error = await createAiClient(ai)(messages, tools).catch((e) => e);

		expect(error).toBeInstanceOf(AiError);
		expect(error.code).toBe("ai_quota_exhausted");
	});

	it("reports any other failure as an AI error", async () => {
		const ai = {
			run: vi.fn(async () => {
				throw new Error("upstream timeout");
			}),
		};

		const error = await createAiClient(ai)(messages, tools).catch((e) => e);

		expect(error).toBeInstanceOf(AiError);
		expect(error.code).toBe("ai_error");
	});
});
