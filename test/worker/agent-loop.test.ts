import { describe, expect, it, vi } from "vitest";
import {
	AiError,
	type AiReply,
	type ChatMessage,
	type ToolCall,
	type ToolDefinition,
} from "../../src/worker/agent/ai-client";
import {
	buildSystemPrompt,
	MAX_ITERATIONS,
	runAgentTurn,
	type TurnInput,
} from "../../src/worker/agent/loop";
import {
	type AgentEvent,
	TOOL_DEFINITIONS,
	type ToolOutcome,
} from "../../src/worker/agent/tools";

const respond = (prose: string, symbols: string[] = []): AiReply => ({
	text: null,
	toolCalls: [{ name: "respond", arguments: { prose, symbols } }],
});
const call = (name: string, args: unknown = {}): AiReply => ({
	text: null,
	toolCalls: [{ name, arguments: args }],
});

function scriptedAi(...replies: (AiReply | Error)[]) {
	const requests: ChatMessage[][] = [];
	const ai = vi.fn(
		async (messages: ChatMessage[], _tools: ToolDefinition[]) => {
			requests.push(structuredClone(messages));
			const reply = replies.shift();
			if (!reply) throw new Error("script exhausted");
			if (reply instanceof Error) throw reply;
			return reply;
		},
	);
	return { ai, requests };
}

function setup(
	replies: (AiReply | Error)[],
	overrides: Partial<TurnInput> = {},
) {
	const { ai, requests } = scriptedAi(...replies);
	const events: AgentEvent[] = [];
	const execute = vi.fn(
		async (_call: ToolCall): Promise<ToolOutcome> => ({
			result: { symbols: ["NET"] },
			events: [{ type: "watchlist", symbols: ["NET"] }],
		}),
	);
	const input: TurnInput = {
		ai,
		toolbox: { execute },
		history: [],
		pendingOffer: [],
		message: "How's my watchlist doing?",
		emit: (event) => events.push(event),
		getWatchlist: async () => ["NET"],
		...overrides,
	};
	return { input, ai, requests, events, execute };
}

describe("runAgentTurn", () => {
	it("sends the system prompt, history and new message with the tools", async () => {
		const { input, ai, requests } = setup([respond("Hello there.")], {
			history: [
				{ role: "user", text: "Hi", at: 1 },
				{ role: "assistant", text: "Hello!", at: 2 },
			],
		});

		await runAgentTurn(input);

		expect(requests[0]).toEqual([
			{ role: "system", content: buildSystemPrompt([]) },
			{ role: "user", content: "Hi" },
			{ role: "assistant", content: "Hello!" },
			{ role: "user", content: "How's my watchlist doing?" },
		]);
		expect(ai.mock.calls[0]?.[1]).toBe(TOOL_DEFINITIONS);
	});

	it("finishes when the model responds", async () => {
		const { input, execute } = setup([
			respond("Your list is mostly up today.", ["NET"]),
		]);

		expect(await runAgentTurn(input)).toEqual({
			ok: true,
			prose: "Your list is mostly up today.",
			symbols: ["NET"],
			offer: [],
		});
		expect(execute).not.toHaveBeenCalled();
	});

	it("runs tool calls, reports them, and feeds the results back", async () => {
		const { input, requests, events, execute } = setup([
			call("list_watchlist"),
			respond("You're watching one symbol."),
		]);

		const result = await runAgentTurn(input);

		expect(result).toMatchObject({ ok: true });
		expect(execute).toHaveBeenCalledWith({
			name: "list_watchlist",
			arguments: {},
		});
		expect(events).toEqual([
			{ type: "tool_call", name: "list_watchlist", args: {} },
			{ type: "watchlist", symbols: ["NET"] },
		]);
		// The real model ignores a tool result unless it follows its own
		// tool call and carries the matching id.
		const [assistantCall, toolResult] = requests[1]?.slice(-2) ?? [];
		const id = assistantCall?.tool_calls?.[0]?.id;
		expect(assistantCall).toEqual({
			role: "assistant",
			content: "",
			tool_calls: [
				{
					id: expect.any(String),
					type: "function",
					function: { name: "list_watchlist", arguments: "{}" },
				},
			],
		});
		expect(toolResult).toEqual({
			role: "tool",
			tool_call_id: id,
			name: "list_watchlist",
			content: JSON.stringify({ symbols: ["NET"] }),
		});
	});

	it("runs several tool calls from one reply in order", async () => {
		const { input, execute } = setup([
			{
				text: null,
				toolCalls: [
					{ name: "add_symbols", arguments: { symbols: ["MU"] } },
					{ name: "get_snapshots", arguments: {} },
				],
			},
			respond("Added it."),
		]);

		await runAgentTurn(input);

		expect(execute.mock.calls.map(([c]) => c.name)).toEqual([
			"add_symbols",
			"get_snapshots",
		]);
	});

	it("does not accept a respond sent alongside other tool calls", async () => {
		const { input, ai } = setup([
			{
				text: null,
				toolCalls: [
					{ name: "get_snapshots", arguments: {} },
					{ name: "respond", arguments: { prose: "Too early.", symbols: [] } },
				],
			},
			respond("Here's the data."),
		]);

		const result = await runAgentTurn(input);

		expect(ai).toHaveBeenCalledTimes(2);
		expect(result).toMatchObject({ ok: true, prose: "Here's the data." });
	});

	it("accepts a plain text reply as the answer", async () => {
		const { input } = setup([{ text: "Hi! Ask me anything.", toolCalls: [] }]);

		expect(await runAgentTurn(input)).toEqual({
			ok: true,
			prose: "Hi! Ask me anything.",
			symbols: [],
			offer: [],
		});
	});

	it("reprompts when the answer contains any digit", async () => {
		const { input, ai, requests } = setup([
			respond("NET is up 2.3% today."),
			respond("NET is up today; see the table."),
		]);

		const result = await runAgentTurn(input);

		expect(ai).toHaveBeenCalledTimes(2);
		expect(requests[1]?.length).toBeGreaterThan(requests[0]?.length ?? 0);
		expect(result).toMatchObject({
			ok: true,
			prose: "NET is up today; see the table.",
		});
	});

	it("applies the digit check to plain text replies too", async () => {
		const { input, ai } = setup([
			{ text: "You have 2 symbols.", toolCalls: [] },
			{ text: "You have a couple of symbols.", toolCalls: [] },
		]);

		await runAgentTurn(input);

		expect(ai).toHaveBeenCalledTimes(2);
	});

	it.each([
		["a respond without prose", call("respond", { symbols: [] })],
		["an empty reply", { text: null, toolCalls: [] }],
	])("asks again after %s", async (_label, bad) => {
		const { input, ai } = setup([bad, respond("All good.")]);

		const result = await runAgentTurn(input);

		expect(ai).toHaveBeenCalledTimes(2);
		expect(result).toMatchObject({ ok: true, prose: "All good." });
	});

	it("gives up after the iteration cap without a clean answer", async () => {
		const replies = Array.from({ length: MAX_ITERATIONS + 1 }, () =>
			respond("Up 5%."),
		);
		const { input, ai } = setup(replies);

		expect(await runAgentTurn(input)).toEqual({
			ok: false,
			error: "loop_limit",
		});
		expect(ai).toHaveBeenCalledTimes(MAX_ITERATIONS);
	});

	it("gives up when the model keeps calling tools", async () => {
		const replies = Array.from({ length: MAX_ITERATIONS + 1 }, () =>
			call("list_watchlist"),
		);
		const { input, ai } = setup(replies);

		expect(await runAgentTurn(input)).toEqual({
			ok: false,
			error: "loop_limit",
		});
		expect(ai).toHaveBeenCalledTimes(MAX_ITERATIONS);
	});

	it.each(["ai_quota_exhausted", "ai_error"] as const)(
		"reports %s from the AI client",
		async (code) => {
			const { input } = setup([new AiError(code, "boom")]);

			expect(await runAgentTurn(input)).toEqual({ ok: false, error: code });
		},
	);

	it("offers to add answered-about symbols that are not on the watchlist", async () => {
		const { input } = setup([
			respond("SNOW is having a good day. Want me to add it?", ["NET", "SNOW"]),
		]);

		expect(await runAgentTurn(input)).toMatchObject({
			ok: true,
			offer: ["SNOW"],
		});
	});

	it("checks the offer against the watchlist as it is after the turn", async () => {
		let watchlist = ["NET"];
		const { input } = setup(
			[
				call("add_symbols", { symbols: ["SNOW"] }),
				respond("Added SNOW.", ["SNOW"]),
			],
			{
				getWatchlist: async () => watchlist,
				toolbox: {
					execute: vi.fn(async () => {
						watchlist = ["NET", "SNOW"];
						return { result: {}, events: [] };
					}),
				},
			},
		);

		expect(await runAgentTurn(input)).toMatchObject({ ok: true, offer: [] });
	});
});

describe("buildSystemPrompt", () => {
	it("forbids advice and stated figures, and requires respond", () => {
		const prompt = buildSystemPrompt([]);

		expect(prompt).toMatch(/financial advice/i);
		expect(prompt).toMatch(/never state prices or percentages/i);
		expect(prompt).toMatch(/\brespond\b/);
		expect(prompt).toMatch(/IEX/);
	});

	it("mentions a pending offer only when there is one", () => {
		expect(buildSystemPrompt([])).not.toMatch(/pending offer/i);

		const prompt = buildSystemPrompt(["SNOW", "DDOG"]);
		expect(prompt).toMatch(/pending offer/i);
		expect(prompt).toContain("SNOW");
		expect(prompt).toContain("DDOG");
		expect(prompt).toMatch(/this message only/i);
	});
});
