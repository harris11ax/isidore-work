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
