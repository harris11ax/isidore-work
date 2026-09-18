// Date helpers shared by the CV page and the homepage's professional section.
export const MONTHS = [
	'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
	'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** "2026-05" -> "May 2026"; "present" -> "Present"; anything else passes through. */
export function fmt(value: string): string {
	if (!value) return '';
	if (value.toLowerCase() === 'present') return 'Present';
	const m = value.match(/^(\d{4})-(\d{2})$/);
	if (!m) return value;
	return `${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/** "2026-05" / "present" -> "May 2026 – Present" (single date when there is no end). */
export function period(r: { start: string; end: string; current: boolean }): string {
	const from = fmt(r.start);
	const to = r.current ? 'Present' : r.end ? fmt(r.end) : '';
	return to ? `${from} – ${to}` : from;
}

/**
 * A project's own date. Records carry either a full day ("2026-08-05") or a month
 * ("2026-07"); both should read as "Aug 2026".
 */
export function monthYear(value: string): string {
	if (!value) return '';
	const m = value.match(/^(\d{4})-(\d{2})/);
	if (!m) return value;
	return `${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}
