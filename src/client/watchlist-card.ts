// Mirrors the server's cap; both move to configuration later.
const WATCHLIST_CAP = 10;

export interface WatchlistCardOptions {
	watchlist: string[];
	onStart: () => Promise<string[] | null>;
	onRefresh: () => void;
}

export function mountWatchlistCard(
	container: HTMLElement,
	{ watchlist, onStart, onRefresh }: WatchlistCardOptions,
): void {
	container.innerHTML = `
		<div class="card-heading">
			<h2 id="watchlist-title">Your watchlist</h2>
			<span id="watchlist-count" class="muted"></span>
		</div>
		<div id="watchlist-body"></div>
		<div id="watchlist-error" class="alert alert-action" role="alert" hidden>
			<p>Couldn't set up the starter list.</p>
			<button id="watchlist-refresh" class="button button-quiet" type="button">
				Refresh
			</button>
		</div>
	`;

	find(container, "#watchlist-count").textContent =
		`${watchlist.length} of ${WATCHLIST_CAP}`;
	find(container, "#watchlist-refresh").addEventListener("click", onRefresh);

	const body = find(container, "#watchlist-body");
	if (watchlist.length > 0) {
		body.replaceChildren(pills(watchlist));
		return;
	}

	body.innerHTML = `
		<p class="muted">
			Up to 10 US stocks or ETFs. Start with QQQ's top 10 holdings, or add
			your own by asking once chat is ready.
		</p>
		<button id="watchlist-starter" class="button button-primary" type="button">
			Start with QQQ's top 10
		</button>
	`;

	const starter = find<HTMLButtonElement>(container, "#watchlist-starter");
	starter.addEventListener("click", async () => {
		starter.disabled = true;
		const started = await onStart();
		if (started) {
			mountWatchlistCard(container, {
				watchlist: started,
				onStart,
				onRefresh,
			});
			return;
		}
		find(container, "#watchlist-error").hidden = false;
	});
}

function pills(watchlist: string[]): HTMLElement {
	const list = document.createElement("ul");
	list.id = "watchlist-pills";
	list.className = "watchlist-pills";
	for (const symbol of watchlist) {
		const item = document.createElement("li");
		item.textContent = symbol;
		list.append(item);
	}
	return list;
}

function find<T extends HTMLElement = HTMLElement>(
	container: HTMLElement,
	selector: string,
): T {
	const element = container.querySelector<T>(selector);
	if (!element) throw new Error(`Missing ${selector}`);
	return element;
}
