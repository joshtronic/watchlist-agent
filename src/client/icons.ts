// Lucide-style icons (24px grid, 2px stroke), inlined so they inherit
// currentColor.
const svg = (paths: string) =>
	`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const micIcon = svg(
	'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M12 17v4"/>',
);

export const sendIcon = svg('<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>');

export const logoutIcon = svg(
	'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
);
