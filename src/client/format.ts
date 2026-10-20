const MINUS = "−";
const DASH = "—";

const priceFormat = new Intl.NumberFormat("en-US", {
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
});

const timeFormat = new Intl.DateTimeFormat("en-US", {
	hour: "numeric",
	minute: "2-digit",
	timeZone: "America/New_York",
});

export function formatPrice(value: number | null): string {
	return value === null ? DASH : priceFormat.format(value);
}

export function formatChange(value: number | null): string {
	return value === null
		? DASH
		: signed(value, priceFormat.format(Math.abs(value)));
}

export function formatPercent(value: number | null): string {
	return value === null
		? DASH
		: signed(value, `${priceFormat.format(Math.abs(value))}%`);
}

export function formatVolume(value: number | null): string {
	if (value === null) return DASH;
	for (const [size, suffix] of [
		[1e9, "B"],
		[1e6, "M"],
		[1e3, "K"],
	] as const) {
		if (value >= size) return `${trim(value / size)}${suffix}`;
	}
	return String(value);
}

const dayFormat = new Intl.DateTimeFormat("en-US", {
	month: "short",
	day: "numeric",
	timeZone: "UTC",
});

/** Formats a trading date (YYYY-MM-DD) as e.g. "Oct 9". */
export function formatDay(date: string): string {
	return dayFormat.format(new Date(`${date}T12:00:00Z`));
}

export function formatAsOf(iso: string): string {
	return `${timeFormat.format(new Date(iso))} ET`;
}

function signed(value: number, magnitude: string): string {
	if (value > 0) return `+${magnitude}`;
	if (value < 0) return `${MINUS}${magnitude}`;
	return magnitude;
}

function trim(value: number): string {
	return value.toFixed(1).replace(/\.0$/, "");
}
