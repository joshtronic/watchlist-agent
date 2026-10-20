export const CHAT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
// Workers AI defaults to 256, which cuts off answers that carry news labels.
const MAX_TOKENS = 1024;

export interface ChatMessage {
	role: "system" | "user" | "assistant" | "tool";
	content: string;
	name?: string;
	// The model only reads a tool result that follows its own tool call
	// (assistant `tool_calls`) and carries the matching `tool_call_id`.
	tool_calls?: {
		id: string;
		type: "function";
		function: { name: string; arguments: string };
	}[];
	tool_call_id?: string;
}

export interface ToolDefinition {
	name: string;
	description: string;
	parameters: Record<string, unknown>;
}

export interface ToolCall {
	name: string;
	arguments: unknown;
}

export interface AiReply {
	text: string | null;
	toolCalls: ToolCall[];
}

export type AiClient = (
	messages: ChatMessage[],
	tools: ToolDefinition[],
) => Promise<AiReply>;

export interface AiRunner {
	run(model: string, input: unknown): Promise<unknown>;
}

export class AiError extends Error {
	readonly code: "ai_quota_exhausted" | "ai_error";

	constructor(code: AiError["code"], message: string) {
		super(message);
		this.code = code;
	}
}

export function createAiClient(ai: AiRunner): AiClient {
	return async (messages, tools) => {
		let output: unknown;
		try {
			output = await ai.run(CHAT_MODEL, {
				messages,
				tools: tools.map((tool) => ({ type: "function", function: tool })),
				max_tokens: MAX_TOKENS,
			});
		} catch (error) {
			throw toAiError(error);
		}
		return parseReply(output);
	};
}

interface RawToolCall {
	name?: unknown;
	arguments?: unknown;
	function?: { name?: unknown; arguments?: unknown };
}

function parseReply(output: unknown): AiReply {
	const { response, tool_calls: rawCalls } = (output ?? {}) as {
		response?: unknown;
		tool_calls?: unknown;
	};

	const toolCalls = Array.isArray(rawCalls)
		? rawCalls.map((raw: RawToolCall) => {
				// Workers AI returns { name, arguments }; OpenAI-style models nest
				// them under `function`.
				const source = raw.function ?? raw;
				return {
					name: String(source.name ?? ""),
					arguments: parseArguments(source.arguments),
				};
			})
		: [];

	const text =
		typeof response === "string" && response.trim() ? response : null;
	return { text, toolCalls };
}

function parseArguments(value: unknown): unknown {
	if (typeof value !== "string") return value ?? {};
	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
}

// Workers AI reports the free tier's daily limit as error 4006.
export function toAiError(error: unknown): AiError {
	const message = error instanceof Error ? error.message : String(error);
	const quota = /\b4006\b|daily free allocation|neurons/i.test(message);
	return new AiError(quota ? "ai_quota_exhausted" : "ai_error", message);
}
