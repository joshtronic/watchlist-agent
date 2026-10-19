import { beforeEach, describe, expect, it, vi } from "vitest";
import { mountLogout } from "../../src/client/logout";

function button(container: HTMLElement, id: string) {
	const match = container.querySelector<HTMLButtonElement>(`button#${id}`);
	if (!match || match.closest("[hidden]")) {
		throw new Error(`No visible button #${id}`);
	}
	return match;
}

function confirmation(container: HTMLElement) {
	return container.querySelector<HTMLElement>("#logout-confirmation");
}

describe("logout control", () => {
	let container: HTMLElement;
	let onConfirm: ReturnType<typeof vi.fn<() => void>>;

	beforeEach(() => {
		document.body.innerHTML = "";
		container = document.createElement("div");
		document.body.append(container);
		onConfirm = vi.fn<() => void>();
		mountLogout(container, { onConfirm });
	});

	it("starts with the confirmation hidden", () => {
		expect(confirmation(container)?.hidden).toBe(true);
	});

	it("asks for confirmation and warns that data will be deleted", () => {
		button(container, "logout-open").click();

		const panel = confirmation(container);
		expect(panel?.hidden).toBe(false);
		expect(panel?.textContent).toMatch(/permanently deletes/i);
		expect(onConfirm).not.toHaveBeenCalled();
	});

	it("does nothing when cancelled", () => {
		button(container, "logout-open").click();
		button(container, "logout-cancel").click();

		expect(confirmation(container)?.hidden).toBe(true);
		expect(onConfirm).not.toHaveBeenCalled();
	});

	it("logs out when confirmed", () => {
		button(container, "logout-open").click();
		button(container, "logout-confirm").click();

		expect(onConfirm).toHaveBeenCalledOnce();
	});
});
