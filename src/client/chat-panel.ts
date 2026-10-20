import { sendChat } from "./chat-api";
import {
	chatErrorMessage,
	describeToolCall,
	renderTranscript,
} from "./chat-view";
import {
	appendEntries,
	type ChatEntry,
	loadHistory,
	memoryBoundary,
	saveHistory,
} from "./history-store";
import { micSupported, type Recording, startRecording } from "./recorder";
import { transcribeAudio } from "./transcribe-api";

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
	const mic = find<HTMLButtonElement>(form, "#composer-mic");
	const canRecord = micSupported();
	let recording: Recording | null = null;
	let transcribing = false;

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
		mic.disabled = busy || !canRecord;
		progress.hidden = !busy;
		if (busy) progress.textContent = "Thinking…";
	};
	const showStatus = (text: string | null) => {
		progress.hidden = text === null;
		progress.textContent = text ?? "";
	};
	const setRecording = (active: boolean) => {
		mic.setAttribute("aria-pressed", String(active));
		mic.setAttribute(
			"aria-label",
			active ? "Stop recording" : "Speak your question",
		);
		mic.classList.toggle("button-recording", active);
	};

	const stopAndTranscribe = async () => {
		if (!recording) return;
		const current = recording;
		recording = null;
		setRecording(false);
		transcribing = true;
		mic.disabled = true;
		showStatus("Transcribing…");
		try {
			const result = await transcribeAudio(await current.stop());
			if (result.ok) {
				// Fill the box for review; the user sends it themselves.
				input.value = result.text;
				showStatus(null);
				input.focus();
			} else {
				showStatus(chatErrorMessage(result.error));
			}
		} catch {
			showStatus(chatErrorMessage("transcription_failed"));
		} finally {
			transcribing = false;
			mic.disabled = input.disabled || !canRecord;
		}
	};

	mic.addEventListener("click", async () => {
		if (transcribing) return;
		if (recording) {
			await stopAndTranscribe();
			return;
		}
		try {
			recording = await startRecording(stopAndTranscribe);
			setRecording(true);
			showStatus(
				"Listening… click the microphone again to stop (up to thirty seconds).",
			);
		} catch {
			recording = null;
			showStatus(chatErrorMessage("mic_unavailable"));
		}
	});

	input.disabled = false;
	submit.disabled = false;
	mic.disabled = !canRecord;
	if (!canRecord) mic.title = "Voice input isn't supported in this browser.";
	render();

	form.addEventListener("submit", async (event) => {
		event.preventDefault();
		const message = input.value.trim();
		if (!message || input.disabled) return;

		input.value = "";
		add({ kind: "user", text: message, at: Date.now() });
		const turnStart = entries.length;
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
						market: chatEvent.market,
						rows: chatEvent.rows,
						at: Date.now(),
					});
					break;
				case "news":
					add({
						kind: "news",
						articles: chatEvent.articles,
						labels: [],
						at: Date.now(),
					});
					break;
				case "news_labels":
					// Labels arrive after the cards; attach them to this turn's news.
					for (const entry of entries.slice(turnStart)) {
						if (entry.kind === "news") entry.labels = chatEvent.labels;
					}
					saveHistory(storage, entries);
					render();
					break;
				case "history":
					add({
						kind: "history",
						period: chatEvent.period,
						from: chatEvent.from,
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
