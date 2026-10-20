import type { AssetCheck, MarketSnapshot } from "../alpaca";
import type { AddStatus, RemoveStatus, SymbolResult } from "../watchlist";
import type { ToolCall, ToolDefinition } from "./ai-client";

export interface SnapshotRow extends MarketSnapshot {
	onWatchlist: boolean;
}

export type AgentEvent =
	| { type: "tool_call"; name: string; args: unknown }
	| { type: "watchlist"; symbols: string[] }
	| { type: "snapshots"; asOf: string; rows: SnapshotRow[] };

export interface ToolOutcome {
	result: unknown;
	events: AgentEvent[];
}

export interface Toolbox {
	execute(call: ToolCall): Promise<ToolOutcome>;
}

export interface ToolDeps {
	getWatchlist(): Promise<string[]>;
	addSymbols(symbols: string[]): Promise<SymbolResult<AddStatus>[]>;
	removeSymbols(symbols: string[]): Promise<SymbolResult<RemoveStatus>[]>;
	checkAsset(symbol: string): Promise<AssetCheck>;
	getSnapshots(symbols: string[]): Promise<MarketSnapshot[]>;
	now(): Date;
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [];

export function createToolbox(_deps: ToolDeps): Toolbox {
	throw new Error("Not implemented");
}
