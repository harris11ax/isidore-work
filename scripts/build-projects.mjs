// Parses master_list.csv -> src/data/projects.json with domain assignment + slugs.
// Idempotent: re-run to regenerate. Asset arrays are preserved from any existing file.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const OUT = "src/data/projects.json";

// ---- domain rules: first matching regex wins (tested against name) ----
const RULES = [
	[/OpenBoard|Audiobook|D3\.js|Dashboard|Intro to ML|Machine Learning|kNN|Linear Algebra|Probability|CS 2130|HooHacks|MATLAB|Jupyter/i, "software-data"],
	[/Capstone|AutoBleedr|Boost Converter|PCB|Audio Analyzer|Electronics - Studios|Embedded|Digital Logic|FPGA|VHDL|DC-AC Converter/i, "embedded-hw"],
	[/3250|3251|Transformer|Machine|Solar|Solid State|SSD|Dominion|Grid|Transmission|Energy Conversion|Boost|renewable/i, "power-energy"],
	[/Gupta|LIBS|EDS|laser ablation|Electromagnetic Fields|Chemistry|CHM|Anatomy|BIO 2870|Solar Cell Lab/i, "research-lab"],
	[/STS 3020|Policy Memo|Policy|Issue Advocacy|Course Paper|SMR|Problem Statement|Presentation \+ Poster/i, "policy-writing"],
	[/RKC|Tour|Coaching|Lesson Plans/i, "teaching-field"],
];
// explicit overrides by exact-ish name fragment (rule order can misfire)
const OVERRIDE = [
	[/AES.*Dashboard|Energy Startups Dashboard/i, "software-data"],
	[/Dominion/i, "power-energy"],
	[/Solar Cell Lab/i, "power-energy"],
	[/Electromagnetic Fields/i, "research-lab"],
];

// heuristic: which tend to have renderable visuals (schematics/plots/posters/video/PCB)
const VISUAL_HINT = /PCB|KiCad|Audio Analyzer|Video|Dashboard|D3|Poster|Presentation|LIBS|Transformer|Converter|FPGA|VHDL|Solar|Jupyter|MATLAB|Machine|Lab \d|Labs|Tour/i;

function slugify(s) {
	return s.toLowerCase()
		.replace(/\([^)]*\)/g, " ")
		.replace(/&/g, " and ")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 60);
}

function domainOf(name) {
	for (const [re, d] of OVERRIDE) if (re.test(name)) return d;
	for (const [re, d] of RULES) if (re.test(name)) return d;
	return "software-data";
}

// minimal CSV parser (handles quoted fields w/ commas)
function parseCSV(text) {
	const rows = [];
	let field = "", row = [], inQ = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (inQ) {
			if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
			else if (c === '"') inQ = false;
			else field += c;
		} else {
			if (c === '"') inQ = true;
			else if (c === ",") { row.push(field); field = ""; }
			else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
			else if (c === "\r") { /* skip */ }
			else field += c;
		}
	}
	if (field.length || row.length) { row.push(field); rows.push(row); }
	return rows.filter(r => r.some(c => c.trim() !== ""));
}

const rows = parseCSV(readFileSync(CSV, "utf8"));
const header = rows.shift().map(h => h.trim());
const idx = Object.fromEntries(header.map((h, i) => [h, i]));

const existing = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : [];
const bySlug = Object.fromEntries(existing.map(p => [p.slug, p]));
const seen = new Set();

const projects = rows.map(r => {
	const name = r[idx.name].trim();
	let slug = slugify(name);
	while (seen.has(slug)) slug += "-x";
	seen.add(slug);
	const prev = bySlug[slug] || {};
	return {
		slug,
		name,
		date: r[idx.date].trim(),
		domain: domainOf(name),
		category: r[idx.category].trim(),
		audience: r[idx.audience].trim(),
		effort: r[idx.effort].trim(),
		timeHours: r[idx.time_hours].trim(),
		summary: prev.summary || "",
		hasVisuals: prev.hasVisuals ?? VISUAL_HINT.test(name),
		sourcePath: r[idx.file_path].trim(),
		tags: prev.tags || [],
		assets: prev.assets || [],
	};
});

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(projects, null, "\t") + "\n");
const counts = projects.reduce((a, p) => (a[p.domain] = (a[p.domain] || 0) + 1, a), {});
console.log(`Wrote ${projects.length} projects ->`, OUT);
console.log(counts);
