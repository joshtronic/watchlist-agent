import { beforeEach, describe, expect, it, vi } from "vitest";
import { mountWatchlistCard } from "../../src/client/watchlist-card";

// Any list will do: the card renders whatever the starter request returns.
const STARTED = ["NET", "QQQ", "MU"];

let container: HTMLElement;

beforeEach(() => {
	document.body.innerHTML = "";
	container = document.createElement("div");
	document.body.append(container);
});

const count = () => container.querySelector("#watchlist-count")?.textContent;
const starter = () =>
	container.querySelector<HTMLButtonElement>("#watchlist-starter");
const pills = () =>
	[...container.querySelectorAll("#watchlist-pills li")].map(
		(li) => li.textContent,
	);
const error = () => container.querySelector<HTMLElement>("#watchlist-error");
const refresh = () =>
	container.querySelector<HTMLButtonElement>("#watchlist-refresh");

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

describe("watchlist card", () => {
	it("offers the starter list when the watchlist is empty", () => {
		mountWatchlistCard(container, {
			watchlist: [],
			onStart: vi.fn(),
			onRefresh: vi.fn(),
		});

		expect(count()).toBe("0 of 10");
		expect(starter()).not.toBeNull();
		expect(pills()).toEqual([]);
	});

	it("shows the symbols in order, without the starter, when not empty", () => {
		mountWatchlistCard(container, {
			watchlist: ["NET", "QQQ"],
			onStart: vi.fn(),
			onRefresh: vi.fn(),
		});

		expect(count()).toBe("2 of 10");
		expect(pills()).toEqual(["NET", "QQQ"]);
		expect(starter()).toBeNull();
	});

	it("disables the starter button while the request is in flight", async () => {
		const pending = deferred<string[] | null>();
		const onStart = vi.fn(() => pending.promise);
		mountWatchlistCard(container, {
			watchlist: [],
			onStart,
			onRefresh: vi.fn(),
		});

		starter()?.click();

		expect(onStart).toHaveBeenCalledOnce();
		expect(starter()?.disabled).toBe(true);
		pending.resolve(STARTED);
		await pending.promise;
	});

	it("shows the starter symbols once they are applied", async () => {
		const onStart = vi.fn(async () => STARTED);
		mountWatchlistCard(container, {
			watchlist: [],
			onStart,
			onRefresh: vi.fn(),
		});

		starter()?.click();
		await vi.waitFor(() => expect(pills()).toEqual(STARTED));

		expect(count()).toBe("3 of 10");
		expect(starter()).toBeNull();
	});

	it("reports a failure and offers a refresh", async () => {
		const onRefresh = vi.fn();
		const onStart = vi.fn(async () => null);
		mountWatchlistCard(container, { watchlist: [], onStart, onRefresh });

		starter()?.click();
		await vi.waitFor(() => expect(error()?.hidden).toBe(false));

		expect(error()?.textContent).not.toBe("");
		expect(pills()).toEqual([]);
		refresh()?.click();
		expect(onRefresh).toHaveBeenCalledOnce();
	});

	it("starts with the error hidden", () => {
		mountWatchlistCard(container, {
			watchlist: [],
			onStart: vi.fn(),
			onRefresh: vi.fn(),
		});

		expect(error()?.hidden).toBe(true);
	});
});
