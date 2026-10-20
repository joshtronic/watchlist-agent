import {
	formatAsOf,
	formatChange,
	formatDay,
	formatNewsTime,
	formatPercent,
	formatPrice,
	formatVolume,
} from "./format";
import type {
	ChatEntry,
	HistoryRow,
	MarketClock,
	NewsArticle,
	NewsLabel,
	SnapshotRow,
} from "./history-store";

const COLUMNS: [label: string, cell: (row: SnapshotRow) => string][] = [
	["Last price", (row) => formatPrice(row.price)],
	["Change", (row) => formatChange(row.change)],
	["Change %", (row) => formatPercent(row.changePct)],
	[
		"Day range",
		(row) =>
			row.dayLow === null || row.dayHigh === null
				? "—"
				: `${formatPrice(row.dayLow)}–${formatPrice(row.dayHigh)}`,
	],
	["Volume (IEX)", (row) => formatVolume(row.dayVolume)],
];

/** Renders the transcript. All text is inserted as text, never as markup. */
export function renderTranscript(
	container: HTMLElement,
	entries: ChatEntry[],
	boundary: number | null,
): void {
	const nodes = entries.map(renderEntry);
	if (boundary !== null) {
		const divider = element("p", "memory-divider", "memory-divider");
		divider.textContent = "Older messages aren't in the assistant's memory";
		nodes.splice(boundary, 0, divider);
	}
	container.replaceChildren(...nodes);
}

const BROKERAGE_NOTE = "For real-time prices, check your brokerage account.";

/** Explains where a snapshot's figures come from and how current they are. */
export function snapshotCaption(
	asOf: string,
	market: MarketClock | null | undefined,
): string {
	const time = formatAsOf(asOf);
	const source =
		"Prices and volume come from the IEX exchange only, so volume is a fraction of all trading and prices can differ slightly from other sources.";
	if (market?.isOpen === false) {
		return `Market closed. These figures are from the last trading session (checked at ${time}). ${source} ${BROKERAGE_NOTE}`;
	}
	if (market?.isOpen) {
		return `Live data as of ${time}. ${source} ${BROKERAGE_NOTE}`;
	}
	return `Data as of ${time}. ${source} ${BROKERAGE_NOTE}`;
}

const PERIOD_LABELS: Record<string, string> = {
	"1w": "Past week",
	"1m": "Past month",
	"3m": "Past three months",
	"6m": "Past six months",
	ytd: "Year to date",
	"1y": "Past year",
};

const HISTORY_COLUMNS: [label: string, cell: (row: HistoryRow) => string][] = [
	["Start", (row) => formatPrice(row.startPrice)],
	["End", (row) => formatPrice(row.endPrice)],
	["Change", (row) => formatChange(row.change)],
	["Change %", (row) => formatPercent(row.changePct)],
	["Period high", (row) => formatPrice(row.high)],
	["Period low", (row) => formatPrice(row.low)],
];

/** Explains a history table's period, source and delay. */
export function historyCaption(period: string, rows: HistoryRow[]): string {
	const label = PERIOD_LABELS[period] ?? "This period";
	const starts = rows.flatMap((row) => (row.startDate ? [row.startDate] : []));
	const ends = rows.flatMap((row) => (row.endDate ? [row.endDate] : []));
	if (starts.length === 0 || ends.length === 0) {
		return `${label}: no price data was available for this period.`;
	}
	const from = formatDay(starts.sort()[0] ?? "");
	const to = formatDay(ends.sort().at(-1) ?? "");
	return `${label}: daily closing prices from ${from} to ${to}, across all US exchanges and delayed at least fifteen minutes. The change is measured from the close on ${from}. ${BROKERAGE_NOTE}`;
}

export function chatErrorMessage(code: string): string {
	switch (code) {
		case "ai_quota_exhausted":
			return "The daily AI budget is used up. Try again tomorrow.";
		case "ai_error":
			return "The assistant had a problem. Try again.";
		case "loop_limit":
			return "I got stuck on that one. Try rephrasing.";
		case "rate_limited":
			return "Slow down a little, then try again.";
		case "network":
			return "Couldn't reach the server. Check your connection and retry.";
		case "no_session":
			return "Your session has ended. Refresh the page to start again.";
		case "transcription_failed":
			return "Couldn't make that out. Try again, or type your question.";
		case "mic_unavailable":
			return "The microphone isn't available. Check your browser's permission, or type your question.";
		case "audio_too_large":
			return "That recording was too long. Keep it under thirty seconds.";
		default:
			return "Something went wrong. Please try again.";
	}
}

export function describeToolCall(name: string, args: unknown): string {
	const symbols = (args as { symbols?: unknown } | null)?.symbols;
	const list = Array.isArray(symbols) ? symbols.join(", ") : "";
	switch (name) {
		case "get_snapshots":
			return list
				? `Fetching snapshots for ${list}…`
				: "Fetching snapshots for your watchlist…";
		case "add_symbols":
			return `Adding ${list}…`;
		case "remove_symbols":
			return `Removing ${list}…`;
		case "list_watchlist":
			return "Checking your watchlist…";
		case "get_news":
			return list
				? `Reading the latest news for ${list}…`
				: "Reading the latest news for your watchlist…";
		case "get_price_history":
			return list
				? `Looking up price history for ${list}…`
				: "Looking up price history for your watchlist…";
		default:
			return "Working…";
	}
}

function renderEntry(entry: ChatEntry): HTMLElement {
	switch (entry.kind) {
		case "user":
		case "assistant": {
			const node = element("p", `message message-${entry.kind}`, entry.kind);
			node.textContent = entry.text;
			return node;
		}
		case "error": {
			const node = element("p", "alert", "error");
			node.textContent = chatErrorMessage(entry.code);
			return node;
		}
		case "snapshots":
			return renderSnapshots(entry.asOf, entry.market, entry.rows);
		case "news":
			return renderNews(entry.articles, entry.labels);
		case "history":
			return renderTable(
				"history",
				HISTORY_COLUMNS,
				entry.rows,
				historyCaption(entry.period, entry.rows),
			);
	}
}

function renderSnapshots(
	asOf: string,
	market: MarketClock | null | undefined,
	rows: SnapshotRow[],
): HTMLElement {
	return renderTable("snapshots", COLUMNS, rows, snapshotCaption(asOf, market));
}

interface TableRow {
	symbol: string;
	onWatchlist: boolean;
	change: number | null;
}

function renderTable<Row extends TableRow>(
	entry: string,
	columns: [label: string, cell: (row: Row) => string][],
	rows: Row[],
	captionText: string,
): HTMLElement {
	const figure = element("figure", "snapshot", entry);
	const scroller = document.createElement("div");
	scroller.className = "snapshot-scroll";
	const table = document.createElement("table");

	const head = table.createTHead().insertRow();
	for (const label of ["Symbol", ...columns.map(([label]) => label)]) {
		const th = document.createElement("th");
		th.scope = "col";
		th.textContent = label;
		head.append(th);
	}

	const body = table.createTBody();
	for (const row of rows) {
		const tr = body.insertRow();
		if (!row.onWatchlist) tr.dataset.offWatchlist = "";
		const symbol = document.createElement("th");
		symbol.scope = "row";
		symbol.textContent = row.symbol;
		if (!row.onWatchlist) {
			const note = document.createElement("span");
			note.className = "off-watchlist";
			note.textContent = "Not on your watchlist";
			symbol.append(" ", note);
		}
		tr.append(symbol);
		for (const [label, cell] of columns) {
			const td = tr.insertCell();
			td.textContent = cell(row);
			// Change columns take the up/down colour (always alongside a sign).
			if (label.startsWith("Change")) td.dataset.signed = "";
		}
		const direction = Math.sign(row.change ?? 0);
		if (direction !== 0) tr.dataset.direction = direction > 0 ? "up" : "down";
	}

	const caption = document.createElement("figcaption");
	caption.textContent = captionText;
	scroller.append(table);
	figure.append(scroller, caption);
	return figure;
}

const KIND_LABELS: Record<string, string> = {
	news: "News",
	analysis: "Analysis",
	analyst_rating: "Analyst rating",
	opinion: "Opinion",
	press_release: "Press release",
};

function renderNews(articles: NewsArticle[], labels: NewsLabel[]): HTMLElement {
	const section = element("section", "news", "news");
	const list = document.createElement("ul");
	list.className = "news-list";

	for (const article of articles) {
		const item = document.createElement("li");
		item.className = "news-card";
		item.dataset.article = String(article.id);

		const headline = isWebUrl(article.url)
			? Object.assign(document.createElement("a"), {
					href: article.url,
					target: "_blank",
					rel: "noopener noreferrer",
				})
			: document.createElement("span");
		headline.className = "news-headline";
		headline.textContent = article.headline;

		const meta = document.createElement("p");
		meta.className = "news-meta";
		meta.textContent = [
			sourceName(article.source),
			article.createdAt ? formatNewsTime(article.createdAt) : "",
			article.symbols.slice(0, 4).join(", "),
		]
			.filter(Boolean)
			.join(" · ");

		item.append(headline, meta);
		if (article.summary) {
			const summary = document.createElement("p");
			summary.className = "news-summary";
			summary.textContent = article.summary;
			item.append(summary);
		}

		const label = labels.find((l) => l.id === article.id);
		if (label) {
			const chips = document.createElement("p");
			chips.className = "news-labels";
			const sentiment = document.createElement("span");
			sentiment.className = "news-chip";
			sentiment.dataset.sentiment = label.sentiment;
			sentiment.textContent = capitalize(label.sentiment);
			const kind = document.createElement("span");
			kind.className = "news-chip";
			kind.textContent = KIND_LABELS[label.kind] ?? capitalize(label.kind);
			chips.append(sentiment, kind);
			item.append(chips);
		}
		list.append(item);
	}

	const caption = document.createElement("p");
	caption.className = "news-caption";
	caption.textContent =
		"Headlines from Benzinga via Alpaca, newest first. Tone and type labels are the assistant's assessment, not facts. Not financial advice.";
	section.append(list, caption);
	return section;
}

function isWebUrl(url: string): boolean {
	try {
		return ["http:", "https:"].includes(new URL(url).protocol);
	} catch {
		return false;
	}
}

function sourceName(source: string): string {
	return source === "benzinga" ? "Benzinga" : source;
}

function capitalize(text: string): string {
	return text.charAt(0).toUpperCase() + text.slice(1);
}

function element(tag: string, className: string, entry: string): HTMLElement {
	const node = document.createElement(tag);
	node.className = className;
	node.dataset.entry = entry;
	return node;
}
