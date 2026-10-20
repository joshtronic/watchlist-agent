export const CHAT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export interface ChatMessage {
	role: "system" | "user" | "assistant" | "tool";
	content: string;
	name?: string;
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

export function createAiClient(_ai: AiRunner): AiClient {
	throw new Error("Not implemented");
}
