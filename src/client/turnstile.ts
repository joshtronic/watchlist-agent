interface TurnstileOptions {
	sitekey: string;
	theme: "light" | "dark" | "auto";
	size: "normal" | "flexible" | "compact";
	callback: (token: string) => void;
	"expired-callback": () => void;
	"error-callback": () => void;
}

interface Turnstile {
	render(container: HTMLElement, options: TurnstileOptions): string;
	reset(widgetId: string): void;
}

declare global {
	interface Window {
		turnstile?: Turnstile;
	}
}

const SCRIPT_URL =
	"https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let loading: Promise<Turnstile> | undefined;

export function loadTurnstile(): Promise<Turnstile> {
	loading ??= new Promise((resolve, reject) => {
		const script = document.createElement("script");
		script.src = SCRIPT_URL;
		script.async = true;
		script.addEventListener("load", () =>
			window.turnstile
				? resolve(window.turnstile)
				: reject(new Error("Turnstile failed to initialise")),
		);
		script.addEventListener("error", () =>
			reject(new Error("Turnstile failed to load")),
		);
		document.head.append(script);
	});
	return loading;
}
