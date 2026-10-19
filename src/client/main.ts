import { canSubmit, type GateState, gateErrorMessage } from "./gate";
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
		<section id="gate">
			<h1>Watchlist Agent</h1>
			<p>
				This is not financial advice. Nothing here is a recommendation to
				buy, sell or hold any security. This site uses a cookie to keep your
				session.
			</p>
			<label>
				<input id="gate-accept" type="checkbox" />
				I understand
			</label>
			<div id="gate-turnstile"></div>
			<button id="gate-submit" type="button" disabled>Continue</button>
			<p id="gate-error" role="alert" hidden></p>
		</section>
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
		<header>
			<h1>Watchlist Agent</h1>
			<div id="logout"></div>
		</header>
		<p id="watchlist-summary"></p>
		<p id="logout-error" role="alert" hidden></p>
	`;
	find("#watchlist-summary").textContent =
		watchlist.length === 0
			? "Your watchlist is empty."
			: `Watching: ${watchlist.join(", ")}`;

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

function find<T extends HTMLElement = HTMLElement>(selector: string): T {
	const element = root.querySelector<T>(selector);
	if (!element) throw new Error(`Missing ${selector}`);
	return element;
}

void start();
