export type TurnstileResult = "passed" | "failed" | "unavailable";

export interface TurnstileCheck {
	token: string;
	secret: string;
	remoteIp: string | null;
}

export async function verifyTurnstile(
	_check: TurnstileCheck,
): Promise<TurnstileResult> {
	throw new Error("Not implemented");
}
