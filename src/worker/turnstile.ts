const SITEVERIFY_URL =
	"https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileResult = "passed" | "failed" | "unavailable";

export interface TurnstileCheck {
	token: string;
	secret: string;
	remoteIp: string | null;
}

export async function verifyTurnstile({
	token,
	secret,
	remoteIp,
}: TurnstileCheck): Promise<TurnstileResult> {
	if (!token) return "failed";

	try {
		const response = await fetch(SITEVERIFY_URL, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				secret,
				response: token,
				...(remoteIp && { remoteip: remoteIp }),
			}),
		});
		if (!response.ok) return "unavailable";

		const outcome: { success?: unknown } = await response.json();
		return outcome.success === true ? "passed" : "failed";
	} catch {
		return "unavailable";
	}
}
