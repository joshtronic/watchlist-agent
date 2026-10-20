// Manual behaviour check of the agent against the real Workers AI model and
// Alpaca data, using an in-memory watchlist. Not part of the test suite:
// model output varies, so treat failures as prompts to look, not as proof.
// Costs neurons (roughly ten to twenty model calls). Never prints keys.
//
// Usage: npm run check:agent

import { getPlatformProxy } from "wrangler";
import { type AiRunner, createAiClient } from "../src/worker/agent/ai-client";
import { type HistoryMessage, runAgentTurn } from "../src/worker/agent/loop";
import { type AgentEvent, createToolbox } from "../src/worker/agent/tools";
import {
	alpacaConfig,
	checkAsset,
	getClock,
	getDailyBars,
	getNews,
	getSnapshots,
} from "../src/worker/alpaca";
import { STARTER_WATCHLIST, WATCHLIST_CAP } from "../src/worker/watchlist";

interface Turn {
	message: string;
	expect: (outcome: TurnOutcome) => string | null;
}

interface TurnOutcome {
	tools: string[];
	events: AgentEvent[];
	prose: string;
	offer: string[];
	newsLabels: number;
	watchlist: string[];
	error?: string;
}

const usedTool = (name: string) => (o: TurnOutcome) =>
	o.tools.includes(name) ? null : `expected ${name}, used [${o.tools}]`;

const CASES: { name: string; watchlist: string[]; turns: Turn[] }[] = [
	{
		name: "summarises the watchlist from snapshots",
		watchlist: [...STARTER_WATCHLIST],
		turns: [
			{
				message: "How's my watchlist doing today?",
				expect: usedTool("get_snapshots"),
			},
		],
	},
	{
		name: "answers a period question from price history",
		watchlist: [...STARTER_WATCHLIST],
		turns: [
			{
				message: "How did AMD perform last week?",
				expect: usedTool("get_price_history"),
			},
		],
	},
	{
		name: "fetches and labels news",
		watchlist: [...STARTER_WATCHLIST],
		turns: [
			{
				message: "What's the latest news on AMD?",
				expect: (o) => {
					const news = o.events.find((e) => e.type === "news");
					if (news?.type !== "news") return "no news fetched";
					return o.newsLabels === news.articles.length
						? null
						: `labelled ${o.newsLabels} of ${news.articles.length} headlines`;
				},
			},
		],
	},
	{
		name: "declines advice without offering a listed symbol",
		watchlist: [...STARTER_WATCHLIST],
		turns: [
			{
				message: "Do you think AAPL is a good buy right now?",
				expect: (o) =>
					/add/i.test(o.prose) && /watchlist/i.test(o.prose)
						? `offered to add a listed symbol: "${o.prose}"`
						: null,
			},
		],
	},
	{
		name: "says plainly when the tools can't answer",
		watchlist: [...STARTER_WATCHLIST],
		turns: [
			{
				message: "What is NVDA's market cap?",
				expect: (o) =>
					o.tools.length === 0 ? null : `called data tools [${o.tools}]`,
			},
		],
	},
	{
		name: "adds an offered symbol when the next message accepts",
		watchlist: STARTER_WATCHLIST.slice(0, 9),
		turns: [
			{
				message: "What about Snowflake?",
				expect: (o) =>
					o.offer.includes("SNOW") ? null : `offer was [${o.offer}]`,
			},
			{
				message: "Yes please",
				expect: (o) =>
					o.watchlist.includes("SNOW") ? null : "SNOW was not added",
			},
		],
	},
	{
		name: "lets an offer expire after one message",
		watchlist: STARTER_WATCHLIST.slice(0, 9),
		turns: [
			{ message: "What about Snowflake?", expect: () => null },
			{ message: "How is AAPL doing?", expect: () => null },
			{
				message: "Yes",
				expect: (o) =>
					o.watchlist.includes("SNOW")
						? "added SNOW from an expired offer"
						: null,
			},
		],
	},
];

const TABLE_TOOLS = ["get_snapshots", "get_price_history"];

// Every turn: the prose may only point at a table this turn produced.
function pointsAtMissingTable(o: TurnOutcome): string | null {
	const fetched = o.tools.some((tool) => TABLE_TOOLS.includes(tool));
	return /\btable\b/i.test(o.prose) && !fetched
		? "mentions a table, but no table was fetched this turn"
		: null;
}

const { env, dispose } = await getPlatformProxy<Env>({ remoteBindings: true });
const market = alpacaConfig(env);
const ai = createAiClient(env.AI as unknown as AiRunner);
let failures = 0;

for (const testCase of CASES) {
	let watchlist = [...testCase.watchlist];
	let history: HistoryMessage[] = [];
	let pendingOffer: string[] = [];
	const toolbox = createToolbox({
		getWatchlist: async () => [...watchlist],
		addSymbols: async (symbols) =>
			symbols.map((symbol) => {
				if (watchlist.includes(symbol)) {
					return { symbol, status: "already_present" as const };
				}
				if (watchlist.length >= WATCHLIST_CAP) {
					return { symbol, status: "cap_reached" as const };
				}
				watchlist.push(symbol);
				return { symbol, status: "added" as const };
			}),
		removeSymbols: async (symbols) =>
			symbols.map((symbol) => {
				if (!watchlist.includes(symbol)) {
					return { symbol, status: "not_present" as const };
				}
				watchlist = watchlist.filter((s) => s !== symbol);
				return { symbol, status: "removed" as const };
			}),
		checkAsset: (symbol) => checkAsset(market, symbol),
		getSnapshots: (symbols) => getSnapshots(market, symbols),
		getClock: () => getClock(market),
		getDailyBars: (symbols, start, end) =>
			getDailyBars(market, symbols, start, end),
		getNews: (symbols, limit) => getNews(market, symbols, limit),
		now: () => new Date(),
	});

	console.log(`\n${testCase.name}`);
	for (const turn of testCase.turns) {
		const events: AgentEvent[] = [];
		const result = await runAgentTurn({
			ai,
			toolbox,
			history,
			pendingOffer,
			message: turn.message,
			emit: (event) => events.push(event),
			getWatchlist: async () => [...watchlist],
		});
		const outcome: TurnOutcome = {
			tools: events.flatMap((e) => (e.type === "tool_call" ? [e.name] : [])),
			events,
			prose: result.ok ? result.prose : "",
			offer: result.ok ? result.offer : [],
			newsLabels: result.ok ? result.newsLabels.length : 0,
			watchlist: [...watchlist],
			...(result.ok ? {} : { error: result.error }),
		};
		const problem = outcome.error
			? `turn failed: ${outcome.error}`
			: (turn.expect(outcome) ?? pointsAtMissingTable(outcome));
		if (problem) failures += 1;
		console.log(`  ${problem ? "FAIL" : "ok  "} > ${turn.message}`);
		console.log(`         tools [${outcome.tools}] · "${outcome.prose}"`);
		if (problem) console.log(`         ${problem}`);

		if (result.ok) {
			history = [
				...history,
				{ role: "user", text: turn.message, at: Date.now() },
				{ role: "assistant", text: result.prose, at: Date.now() },
			];
			pendingOffer = result.offer;
		} else {
			pendingOffer = [];
		}
	}
}

await dispose();
console.log(
	failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
