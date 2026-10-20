import {
	formatAsOf,
	formatChange,
	formatPercent,
	formatPrice,
	formatVolume,
} from "./format";
import type { ChatEntry, SnapshotRow } from "./history-store";

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
			return renderSnapshots(entry.asOf, entry.rows);
	}
}

function renderSnapshots(asOf: string, rows: SnapshotRow[]): HTMLElement {
	const figure = element("figure", "snapshot", "snapshots");
	const scroller = document.createElement("div");
	scroller.className = "snapshot-scroll";
	const table = document.createElement("table");

	const head = table.createTHead().insertRow();
	for (const label of ["Symbol", ...COLUMNS.map(([label]) => label)]) {
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
		for (const [, cell] of COLUMNS) {
			const td = tr.insertCell();
			td.textContent = cell(row);
		}
		const direction = Math.sign(row.change ?? 0);
		if (direction !== 0) tr.dataset.direction = direction > 0 ? "up" : "down";
	}

	const caption = document.createElement("figcaption");
	caption.textContent = `As of ${formatAsOf(asOf)} · Source: IEX feed`;
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
