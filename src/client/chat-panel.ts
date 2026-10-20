import { sendChat } from "./chat-api";
import { describeToolCall, renderTranscript } from "./chat-view";
import {
	appendEntries,
	type ChatEntry,
	loadHistory,
	memoryBoundary,
} from "./history-store";

export interface ChatPanelOptions {
	conversation: HTMLElement;
	form: HTMLFormElement;
	onWatchlist: (symbols: string[]) => void;
}

export function mountChatPanel({
	conversation,
	form,
	onWatchlist,
}: ChatPanelOptions): void {
	const storage = safeStorage();
	const entries = loadHistory(storage);

	conversation.innerHTML = `
		<div id="chat-empty" class="conversation-empty">
			<h2>Ask about your stocks</h2>
			<p class="muted">
				Try "How's my watchlist doing today?" or "Add Cloudflare".
			</p>
		</div>
		<div id="transcript" class="transcript" aria-live="polite"></div>
		<p id="chat-progress" class="chat-progress muted" role="status" hidden></p>
	`;
	const transcript = find(conversation, "#transcript");
	const empty = find(conversation, "#chat-empty");
	const progress = find(conversation, "#chat-progress");
	const input = find<HTMLInputElement>(form, "input");
	const submit = find<HTMLButtonElement>(form, 'button[type="submit"]');

	const render = () => {
		empty.hidden = entries.length > 0;
		renderTranscript(transcript, entries, memoryBoundary(entries));
		progress.scrollIntoView({ block: "end" });
	};
	const add = (entry: ChatEntry) => {
		entries.push(entry);
		appendEntries(storage, [entry]);
		render();
	};
	const setBusy = (busy: boolean) => {
		input.disabled = busy;
		submit.disabled = busy;
		progress.hidden = !busy;
		if (busy) progress.textContent = "Thinking…";
	};

	input.disabled = false;
	submit.disabled = false;
	render();

	form.addEventListener("submit", async (event) => {
		event.preventDefault();
		const message = input.value.trim();
		if (!message || input.disabled) return;

		input.value = "";
		add({ kind: "user", text: message, at: Date.now() });
		setBusy(true);

		await sendChat(message, (chatEvent) => {
			switch (chatEvent.type) {
				case "tool_call":
					progress.textContent = describeToolCall(
						chatEvent.name,
						chatEvent.args,
					);
					break;
				case "watchlist":
					onWatchlist(chatEvent.symbols);
					break;
				case "snapshots":
					add({
						kind: "snapshots",
						asOf: chatEvent.asOf,
						rows: chatEvent.rows,
						at: Date.now(),
					});
					break;
				case "message":
					add({ kind: "assistant", text: chatEvent.prose, at: Date.now() });
					break;
				case "error":
					add({ kind: "error", code: chatEvent.code, at: Date.now() });
					break;
				case "done":
					setBusy(false);
					input.focus();
					break;
			}
		});
	});
}

function safeStorage(): Storage {
	try {
		return window.localStorage;
	} catch {
		// Blocked storage: history-store tolerates a storage that always throws.
		return {} as Storage;
	}
}

function find<T extends HTMLElement = HTMLElement>(
	container: HTMLElement,
	selector: string,
): T {
	const element = container.querySelector<T>(selector);
	if (!element) throw new Error(`Missing ${selector}`);
	return element;
}
