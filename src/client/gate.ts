export interface GateState {
	accepted: boolean;
	token: string | null;
	submitting: boolean;
}

export function canSubmit({ accepted, token, submitting }: GateState): boolean {
	return accepted && Boolean(token) && !submitting;
}

export function gateErrorMessage(error: string): string {
	switch (error) {
		case "turnstile_failed":
			return "We couldn't verify you're human. Please try the check again.";
		case "turnstile_unavailable":
			return "The human check is unavailable right now. Try again shortly.";
		case "disclaimer_required":
			return "Please confirm you've read the disclaimer.";
		case "network":
			return "Couldn't reach the server. Check your connection and retry.";
		default:
			return "Something went wrong. Please try again.";
	}
}
