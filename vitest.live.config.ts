import { defineConfig } from "vitest/config";

// Opt-in suite that hits real services (Workers AI, Alpaca). Costs neurons.
export default defineConfig({
	test: {
		include: ["test/live/**/*.test.ts"],
		passWithNoTests: true,
	},
});
