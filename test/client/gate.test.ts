import { describe, expect, it } from "vitest";
import { canSubmit, gateErrorMessage } from "../../src/client/gate";

describe("canSubmit", () => {
	it.each([
		[false, null, false, false],
		[true, null, false, false],
		[false, "token", false, false],
		[true, "token", true, false],
		[true, "token", false, true],
	])(
		"accepted=%s token=%s submitting=%s → %s",
		(accepted, token, submitting, expected) => {
			expect(canSubmit({ accepted, token, submitting })).toBe(expected);
		},
	);
});

describe("gateErrorMessage", () => {
	const codes = [
		"turnstile_failed",
		"turnstile_unavailable",
		"disclaimer_required",
		"network",
	] as const;

	it("has a distinct message for each known error", () => {
		const messages = codes.map(gateErrorMessage);

		for (const message of messages) expect(message).not.toBe("");
		expect(new Set(messages).size).toBe(codes.length);
	});

	it("falls back to a generic message for anything else", () => {
		expect(gateErrorMessage("bad_request")).toBe(gateErrorMessage("unknown"));
		expect(gateErrorMessage("unknown")).not.toBe("");
	});
});
