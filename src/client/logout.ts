export interface LogoutOptions {
	onConfirm: () => void;
}

export function mountLogout(
	container: HTMLElement,
	{ onConfirm }: LogoutOptions,
): void {
	container.innerHTML = `
		<button id="logout-open" type="button">Log out</button>
		<div id="logout-confirmation" role="alertdialog" hidden>
			<p>
				Logging out permanently deletes your watchlist and chat history.
			</p>
			<button id="logout-cancel" type="button">Cancel</button>
			<button id="logout-confirm" type="button">Delete everything</button>
		</div>
	`;

	const open = find(container, "#logout-open");
	const confirmation = find(container, "#logout-confirmation");

	const setConfirming = (confirming: boolean) => {
		open.hidden = confirming;
		confirmation.hidden = !confirming;
	};

	open.addEventListener("click", () => setConfirming(true));
	find(container, "#logout-cancel").addEventListener("click", () =>
		setConfirming(false),
	);
	find(container, "#logout-confirm").addEventListener("click", onConfirm);
}

function find(container: HTMLElement, selector: string): HTMLElement {
	const element = container.querySelector<HTMLElement>(selector);
	if (!element) throw new Error(`Missing ${selector}`);
	return element;
}
