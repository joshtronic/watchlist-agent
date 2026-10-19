export interface GateState {
	accepted: boolean;
	token: string | null;
	submitting: boolean;
}

export function canSubmit(_state: GateState): boolean {
	throw new Error("Not implemented");
}

export function gateErrorMessage(_error: string): string {
	throw new Error("Not implemented");
}
