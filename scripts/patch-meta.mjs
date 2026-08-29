// One-off: enrich key projects with summary/tags and the AES embed asset.
import { readFileSync, writeFileSync } from "node:fs";
const OUT = "src/data/projects.json";
const p = JSON.parse(readFileSync(OUT, "utf8"));
const by = Object.fromEntries(p.map((x) => [x.slug, x]));

const META = {
	"american-energy-society-energy-startups-dashboard": {
		summary: "Interactive D3/Plotly dashboard profiling energy-sector startups by funding, stage, and sector. Rebuilt here with entirely synthetic data.",
		tags: ["d3", "plotly", "dataviz", "javascript"],
		embed: { type: "embed", src: "/projects/american-energy-society-energy-startups-dashboard/dashboard.html", caption: "Live demo (synthetic data)" },
	},
	"openboard-lecture-to-concept-map-automation-pipeline": {
		summary: "Pipeline turning lecture recordings into concept maps: LLM + OCR extract concepts, NetworkX builds the graph, served to a self-hosted OpenBoard.",
		tags: ["python", "llm", "ocr", "networkx"],
	},
	"text-and-pdf-to-audiobook-converter": {
		summary: "Converts text and PDFs to spoken audiobooks via edge-tts, with both a CLI and a tkinter GUI.",
		tags: ["python", "tts", "tkinter", "cli"],
	},
	"ece-4907-gupta-lab-rare-earth-element-recovery-from-hdds-res": {
		summary: "Research on recovering rare-earth elements from scrapped hard drives using LIBS/EDS and laser ablation.",
		tags: ["spectroscopy", "materials", "research"],
	},
	"ece-4440-4991-capstone-autobleedr-automated-bicycle-brake-bl": {
		summary: "Capstone proposal for AutoBleedr — an automated bicycle brake-bleeding machine.",
		tags: ["capstone", "mechatronics", "hardware"],
	},
	"ece-2300-applied-circuits-boost-converter-pcb-project": {
		summary: "Designed and laid out a boost-converter PCB in KiCad, validated in Multisim.",
		tags: ["pcb", "kicad", "power-electronics"],
	},
	"sts-3020-course-paper-final-research-paper": {
		summary: "Research paper arguing for modular regulation to accelerate small modular reactor (SMR) deployment.",
		tags: ["policy", "nuclear", "smr"],
	},
};

for (const [slug, m] of Object.entries(META)) {
	const proj = by[slug];
	if (!proj) { console.warn("missing", slug); continue; }
	if (m.summary) proj.summary = m.summary;
	if (m.tags) proj.tags = m.tags;
	if (m.embed && !proj.assets.some((a) => a.type === "embed")) {
		proj.assets.push(m.embed);
		proj.hasVisuals = true;
	}
}
writeFileSync(OUT, JSON.stringify(p, null, "\t") + "\n");
console.log("patched", Object.keys(META).length, "projects");
