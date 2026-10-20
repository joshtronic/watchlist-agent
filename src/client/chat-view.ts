import {
	formatAsOf,
	formatChange,
	formatDay,
	formatPercent,
	formatPrice,
	formatVolume,
} from "./format";
import type {
	ChatEntry,
	HistoryRow,
	MarketClock,
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

function element(tag: string, className: string, entry: string): HTMLElement {
	const node = document.createElement(tag);
	node.className = className;
	node.dataset.entry = entry;
	return node;
}
