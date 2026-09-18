import projectsData from "../data/projects.json";

export type AssetType = "image" | "pdf" | "video" | "embed";

export interface Asset {
	type: AssetType;
	src: string;
	caption?: string;
	thumb?: string; // preview image for pdf/video/embed
}

export interface Project {
	slug: string;
	name: string;
	date: string;
	domain: string;
	category: string;
	audience: string;
	effort: string;
	timeHours: string;
	summary: string;
	hasVisuals: boolean;
	cover?: string; // card-only cover image; not shown in the detail gallery
	tags: string[];
	assets: Asset[];
	// facts from the portfolio database; optional so a hand-written record stays valid
	course?: string;
	term?: string;
	org?: string;
	kind?: string; // Role | Work | Coursework | Personal | Volunteer | Fellowship
	status?: string; // e.g. "In progress"
	deliverables?: string[];
	tools?: string[];
	redirectFrom?: string; // old URL this record replaced (gets a 301)
}

export const projects: Project[] = (projectsData as Project[])
	.slice()
	.sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first

export function getProjectBySlug(slug: string): Project | undefined {
	return projects.find((p) => p.slug === slug);
}

export function year(dateStr: string): string {
	return dateStr.slice(0, 4);
}

/** The pieces of the meta line that actually have a value, in display order. */
export function metaLine(p: Project): string[] {
	const parts: string[] = [p.date, p.category];
	if (p.course) parts.push(p.term ? `${p.course} · ${p.term}` : p.course);
	if (p.audience) parts.push(p.audience);
	if (p.effort) parts.push(`Effort: ${p.effort}`);
	if (p.timeHours) parts.push(p.timeHours);
	return parts.filter(Boolean);
}
