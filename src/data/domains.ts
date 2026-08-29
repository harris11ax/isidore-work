// Domain taxonomy — the primary grouping + filter axis for projects.
export interface Domain {
	slug: string;
	label: string;
	blurb: string;
	color: string; // accent used for cards/chips
}

export const DOMAINS: Domain[] = [
	{ slug: "power-energy", label: "Power & Energy Systems", blurb: "Machines, transformers, converters, grid & renewables.", color: "#c2410c" },
	{ slug: "embedded-hw", label: "Embedded & Hardware", blurb: "PCBs, FPGAs, microcontrollers, analog & mixed-signal.", color: "#7c3aed" },
	{ slug: "software-data", label: "Software, Data & ML", blurb: "Pipelines, dashboards, machine learning & numerics.", color: "#2563eb" },
	{ slug: "research-lab", label: "Research & Lab Science", blurb: "Spectroscopy, fields, materials & bench work.", color: "#0d9488" },
	{ slug: "policy-writing", label: "Policy & Writing", blurb: "Science-and-technology policy memos & advocacy.", color: "#65a30d" },
	{ slug: "teaching-field", label: "Teaching & Field Work", blurb: "Coaching, tours & program instruction.", color: "#db2777" },
];

export const CATEGORIES = ["School", "Work", "Personal"] as const;

export const domainMap = Object.fromEntries(DOMAINS.map((d) => [d.slug, d]));
