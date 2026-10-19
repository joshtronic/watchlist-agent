import "@fontsource-variable/figtree";
import "./styles.css";
import { canSubmit, type GateState, gateErrorMessage } from "./gate";
import { micIcon, sendIcon } from "./icons";
import { clearLocalData } from "./local-data";
import { mountLogout } from "./logout";
import { createSession, getConfig, getSession, logout } from "./session-api";
import { loadTurnstile } from "./turnstile";

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("Missing #app");
const root = app;

async function start() {
	try {
		const session = await getSession();
		if (session.kind === "active") showApp(session.watchlist);
		else await showGate();
	} catch {
		root.textContent = "Couldn't load the app. Please refresh to try again.";
	}
}

async function showGate() {
	root.innerHTML = `
		<main id="gate" class="gate">
			<section class="card" aria-labelledby="gate-title">
				<h1 id="gate-title">Watchlist Agent</h1>
				<p class="muted">
					Keep an eye on a few stocks and ask about them in plain words.
				</p>
				<div class="gate-disclaimer">
					<p>
						This is not financial advice. Nothing here is a recommendation to
						buy, sell or hold any security.
					</p>
					<p>This site uses a cookie to keep your session.</p>
				</div>
				<label class="checkbox">
					<input id="gate-accept" type="checkbox" />
					I understand
				</label>
				<div id="gate-turnstile" class="gate-turnstile"></div>
				<button
					id="gate-submit"
					class="button button-primary"
					type="button"
					disabled
				>
					Continue
				</button>
				<p id="gate-error" class="alert" role="alert" hidden></p>
			</section>
		</main>
	`;

	const accept = find<HTMLInputElement>("#gate-accept");
	const submit = find<HTMLButtonElement>("#gate-submit");
	const error = find<HTMLElement>("#gate-error");
	const state: GateState = { accepted: false, token: null, submitting: false };
	const update = () => {
		submit.disabled = !canSubmit(state);
	};
	const showError = (code: string) => {
		error.textContent = gateErrorMessage(code);
		error.hidden = false;
	};

	accept.addEventListener("change", () => {
		state.accepted = accept.checked;
		update();
	});

	let widgetId: string | undefined;
	let turnstile: Awaited<ReturnType<typeof loadTurnstile>> | undefined;
	try {
		const [config, loaded] = await Promise.all([getConfig(), loadTurnstile()]);
		turnstile = loaded;
		widgetId = turnstile.render(find("#gate-turnstile"), {
			sitekey: config.turnstileSiteKey,
			theme: "light",
			// Turnstile can't shrink below 300px; use its compact form where that
			// won't fit inside the card.
			size: matchMedia("(max-width: 22.25rem)").matches
				? "compact"
				: "flexible",
			callback: (token) => {
				state.token = token;
				update();
			},
			"expired-callback": () => {
				state.token = null;
				update();
			},
			"error-callback": () => showError("turnstile_unavailable"),
		});
	} catch {
		showError("turnstile_unavailable");
	}

	submit.addEventListener("click", async () => {
		if (!state.token) return;
		state.submitting = true;
		update();
		error.hidden = true;

		const result = await createSession(state.token);
		if (result.ok) {
			showApp(result.watchlist);
			return;
		}

		showError(result.error);
		state.submitting = false;
		state.token = null;
		if (turnstile && widgetId) turnstile.reset(widgetId);
		update();
	});
}

function showApp(watchlist: string[]) {
	root.innerHTML = `
		<div class="shell">
			<header class="shell-header">
				<h1>Watchlist Agent</h1>
				<div id="logout"></div>
			</header>
			<main class="shell-main">
				<p id="logout-error" class="alert" role="alert" hidden></p>
				<section class="card" aria-labelledby="watchlist-title">
					<div class="card-heading">
						<h2 id="watchlist-title">Your watchlist</h2>
						<span id="watchlist-count" class="muted"></span>
					</div>
					<div id="watchlist-body"></div>
				</section>
				<section class="card conversation" aria-label="Conversation">
					<div class="conversation-empty">
						<h2>Chat is on its way</h2>
						<p class="muted">
							Soon you'll be able to ask how your stocks are doing, right here.
						</p>
					</div>
				</section>
			</main>
			<footer class="composer">
				<form class="composer-bar" aria-label="Ask about your stocks">
					<input
						type="text"
						aria-label="Message"
						placeholder="Ask about your stocks…"
						disabled
					/>
					<button
						class="button button-icon button-quiet"
						type="button"
						aria-label="Speak your question"
						disabled
					>
						${micIcon}
					</button>
					<button class="button button-primary" type="submit" disabled>
						<span class="button-label">Send</span>
						${sendIcon}
					</button>
				</form>
				<p class="fine-print">Not financial advice.</p>
			</footer>
		</div>
	`;
	find("#watchlist-count").textContent = `${watchlist.length} of 10`;
	renderWatchlist(find("#watchlist-body"), watchlist);

	mountLogout(find("#logout"), {
		onConfirm: async () => {
			if (!(await logout())) {
				const error = find("#logout-error");
				error.textContent = "Couldn't log out. Please try again.";
				error.hidden = false;
				return;
			}
			try {
				clearLocalData(window.localStorage);
			} catch {
				// Accessing localStorage itself can throw when storage is blocked.
			}
			await showGate();
		},
	});
}

function renderWatchlist(container: HTMLElement, watchlist: string[]) {
	if (watchlist.length === 0) {
		const empty = document.createElement("p");
		empty.className = "muted";
		empty.textContent =
			"Up to 10 US stocks or ETFs. You'll add them by asking, once chat is ready.";
		container.replaceChildren(empty);
		return;
	}

	const list = document.createElement("ul");
	list.className = "watchlist-pills";
	for (const symbol of watchlist) {
		const item = document.createElement("li");
		item.textContent = symbol;
		list.append(item);
	}
	container.replaceChildren(list);
}

function find<T extends HTMLElement = HTMLElement>(selector: string): T {
	const element = root.querySelector<T>(selector);
	if (!element) throw new Error(`Missing ${selector}`);
	return element;
}

void start();
