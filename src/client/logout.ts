import { logoutIcon } from "./icons";

export interface LogoutOptions {
	onConfirm: () => void;
}

export function mountLogout(
	container: HTMLElement,
	{ onConfirm }: LogoutOptions,
): void {
	container.classList.add("logout");
	container.innerHTML = `
		<button id="logout-open" class="button button-quiet" type="button">
			${logoutIcon}
			<span class="button-label">Log out</span>
		</button>
		<div
			id="logout-confirmation"
			class="logout-confirmation"
			role="alertdialog"
			aria-labelledby="logout-warning"
			hidden
		>
			<p id="logout-warning">
				Logging out permanently deletes your watchlist and chat history.
			</p>
			<button id="logout-cancel" class="button button-quiet" type="button">
				Cancel
			</button>
			<button id="logout-confirm" class="button button-danger" type="button">
				Delete everything
			</button>
		</div>
	`;

	const open = find(container, "#logout-open");
	const confirmation = find(container, "#logout-confirmation");
	const cancel = find(container, "#logout-cancel");

	const setConfirming = (confirming: boolean) => {
		open.hidden = confirming;
		confirmation.hidden = !confirming;
		(confirming ? cancel : open).focus();
	};

	open.addEventListener("click", () => setConfirming(true));
	cancel.addEventListener("click", () => setConfirming(false));
	find(container, "#logout-confirm").addEventListener("click", onConfirm);
}

function find(container: HTMLElement, selector: string): HTMLElement {
	const element = container.querySelector<HTMLElement>(selector);
	if (!element) throw new Error(`Missing ${selector}`);
	return element;
}
