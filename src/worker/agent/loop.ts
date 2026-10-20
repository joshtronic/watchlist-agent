import { normalizeSymbol, WATCHLIST_CAP } from "../watchlist";
import {
	type AiClient,
	AiError,
	type ChatMessage,
	type ToolCall,
} from "./ai-client";
import {
	type AgentEvent,
	NEWS_KINDS,
	NEWS_SENTIMENTS,
	type NewsLabel,
	TOOL_DEFINITIONS,
	type Toolbox,
} from "./tools";

export const MAX_ITERATIONS = 5;

export interface HistoryMessage {
	role: "user" | "assistant";
	text: string;
	at: number;
}

export interface TurnInput {
	ai: AiClient;
	toolbox: Toolbox;
	history: HistoryMessage[];
	pendingOffer: string[];
	message: string;
	emit(event: AgentEvent): void;
	getWatchlist(): Promise<string[]>;
}

export type TurnResult =
	| {
			ok: true;
			prose: string;
			symbols: string[];
			offer: string[];
			newsLabels: NewsLabel[];
	  }
	| { ok: false; error: "loop_limit" | "ai_error" | "ai_quota_exhausted" };

export interface PromptContext {
	watchlist: string[];
	pendingOffer: string[];
}

export function buildSystemPrompt({
	watchlist,
	pendingOffer,
}: PromptContext): string {
	const lines = [
		"You are Watchlist Agent, a friendly assistant that helps people keep an eye on a small watchlist of US stocks and ETFs. Many users are not traders, so use plain words and explain any term you use.",
		"",
		watchlist.length > 0
			? `The user's watchlist right now (${watchlist.length} of ${WATCHLIST_CAP}): ${watchlist.join(", ")}.`
			: `The user's watchlist is empty (it holds up to ${WATCHLIST_CAP} symbols).`,
		"",
		"Rules:",
		"- Never give financial advice: no recommendations, price targets, predictions, or buy, sell or hold opinions. Politely decline and offer factual data instead.",
		'- Never state prices or percentages, and never write any digits at all. The app shows the numbers from your tool results as tables; refer to them instead (for example "see the table above"). Only refer to a table you fetched in this turn; if you did not call a data tool, there is no table to point at.',
		"- Use the tools to read or change the watchlist and to fetch market data. Never guess data.",
		"- Market data comes from the IEX exchange only. Its volume is a fraction of the whole market, so say so when volume comes up. Check the market status in the tool results: when the market is closed, the figures are from the last trading session, so never describe them as today's move.",
		"- If the user asks about a symbol that is not on their watchlist, answer the question, then ask whether they would like to add it. Never offer to add a symbol that is already on the watchlist above. If the watchlist is full, ask whether they would like to swap a symbol out. Never add it until they accept.",
		"- Always finish by calling the respond tool exactly once, with your answer as prose and the symbols your answer is about.",
		"",
		"What you can do: read and change the watchlist (US stocks and ETFs only); fetch the latest snapshot for symbols (last price, change since the previous close, the day's range, and IEX volume); fetch price history over a period (past week, month, three months, six months, year to date, or year), which gives the starting and ending price, the change, and the period's high and low; and fetch the latest news headlines.",
		"News: when you fetch news, label every headline in respond with its id, whether its tone for the company looks positive, negative or neutral, and what kind of article it is (news, analysis, analyst_rating, opinion or press_release). In your prose, sum up the overall tone of the coverage in plain words. Never repeat analyst ratings or price targets, and never treat them as a recommendation; the headlines are shown to the user as cards.",
		'Pick the tool that matches the question: use price history for questions about a period ("how did AMD do last week"), and snapshots for how things stand now. When you answer from price history, name the period the table covers.',
		"What you cannot do: intraday or hourly moves, company fundamentals (market cap, earnings, revenue, dividends, P/E ratios), analyst ratings, predictions or forecasts, crypto, options, futures, non-US markets, or anything else the tools do not return.",
		"When a question needs something you cannot do, say so plainly. If you show related data instead, say exactly what you are showing instead (for example: this is the latest snapshot, not last week's performance). Never present data as answering a question it does not answer.",
	];
	if (pendingOffer.length > 0) {
		lines.push(
			"",
			`Pending offer: in your last message you offered to add ${pendingOffer.join(", ")}. This offer is valid for this message only: add them only if this message clearly accepts it. Any other earlier offer has expired and must not be acted on.`,
		);
	}
	return lines.join("\n");
}

const NO_DIGITS_REMINDER =
	"Your answer contained digits. Rewrite it without any digits, prices or percentages; the user already sees the numbers in the table. Then call respond again.";
const RESPOND_REMINDER =
	"Finish by calling the respond tool with your answer as prose and the symbols it is about.";

export async function runAgentTurn(input: TurnInput): Promise<TurnResult> {
	const watchlist = await input.getWatchlist();
	const messages: ChatMessage[] = [
		{
			role: "system",
			content: buildSystemPrompt({
				watchlist,
				pendingOffer: input.pendingOffer,
			}),
		},
		...input.history.map((entry) => ({
			role: entry.role,
			content: entry.text,
		})),
		{ role: "user", content: input.message },
	];

	// Articles fetched this turn; only these can be labelled.
	const newsIds = new Set<number>();
	const emit = (event: AgentEvent) => {
		if (event.type === "news") {
			for (const article of event.articles) newsIds.add(article.id);
		}
		input.emit(event);
	};
	const turn = { ...input, emit };

	for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
		let reply: Awaited<ReturnType<AiClient>>;
		try {
			reply = await input.ai(messages, TOOL_DEFINITIONS);
		} catch (error) {
			if (error instanceof AiError) return { ok: false, error: error.code };
			throw error;
		}

		const toolCalls = reply.toolCalls.filter((c) => c.name !== "respond");
		if (toolCalls.length > 0) {
			// Any respond in the same reply was written before seeing these
			// results, so it is ignored and the model is asked again.
			const ids = toolCalls.map((_, index) => `call_${iteration}_${index}`);
			messages.push({
				role: "assistant",
				content: "",
				tool_calls: toolCalls.map((call, index) => ({
					id: ids[index] ?? "",
					type: "function",
					function: {
						name: call.name,
						arguments: JSON.stringify(call.arguments ?? {}),
					},
				})),
			});
			for (const [index, call] of toolCalls.entries()) {
				messages.push(await runTool(turn, call, ids[index] ?? ""));
			}
			continue;
		}

		const answer = readAnswer(reply);
		if (!answer) {
			messages.push({ role: "user", content: RESPOND_REMINDER });
			continue;
		}
		if (/\d/.test(answer.prose)) {
			messages.push(
				{ role: "assistant", content: answer.prose },
				{ role: "user", content: NO_DIGITS_REMINDER },
			);
			continue;
		}

		const watchlist = await input.getWatchlist();
		return {
			ok: true,
			prose: answer.prose,
			symbols: answer.symbols,
			offer: answer.symbols.filter((symbol) => !watchlist.includes(symbol)),
			newsLabels: readNewsLabels(reply, newsIds),
		};
	}

	return { ok: false, error: "loop_limit" };
}

async function runTool(
	input: TurnInput,
	call: ToolCall,
	id: string,
): Promise<ChatMessage> {
	input.emit({ type: "tool_call", name: call.name, args: call.arguments });
	const outcome = await input.toolbox.execute(call);
	for (const event of outcome.events) input.emit(event);
	return {
		role: "tool",
		tool_call_id: id,
		name: call.name,
		content: JSON.stringify(outcome.result),
	};
}

function readNewsLabels(
	reply: Awaited<ReturnType<AiClient>>,
	newsIds: Set<number>,
): NewsLabel[] {
	const respond = reply.toolCalls.find((c) => c.name === "respond");
	const raw = (respond?.arguments as { newsLabels?: unknown } | undefined)
		?.newsLabels;
	if (!Array.isArray(raw)) return [];

	const labels = new Map<number, NewsLabel>();
	for (const item of raw) {
		const { id, sentiment, kind } = (item ?? {}) as Record<string, unknown>;
		if (
			typeof id === "number" &&
			newsIds.has(id) &&
			NEWS_SENTIMENTS.includes(sentiment as NewsLabel["sentiment"]) &&
			NEWS_KINDS.includes(kind as NewsLabel["kind"])
		) {
			labels.set(id, {
				id,
				sentiment: sentiment as NewsLabel["sentiment"],
				kind: kind as NewsLabel["kind"],
			});
		}
	}
	return [...labels.values()];
}

function readAnswer(
	reply: Awaited<ReturnType<AiClient>>,
): { prose: string; symbols: string[] } | null {
	const respond = reply.toolCalls.find((c) => c.name === "respond");
	if (!respond) {
		return reply.text ? { prose: reply.text.trim(), symbols: [] } : null;
	}

	const { prose, symbols } = (respond.arguments ?? {}) as {
		prose?: unknown;
		symbols?: unknown;
	};
	if (typeof prose !== "string" || !prose.trim()) return null;
	return {
		prose: prose.trim(),
		symbols: Array.isArray(symbols)
			? symbols
					.filter((s): s is string => typeof s === "string")
					.map((s) => normalizeSymbol(s) ?? s.trim().toUpperCase())
			: [],
	};
}
