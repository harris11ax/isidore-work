// Summaries + tags for every project. Preserves assets. Re-runnable.
import { readFileSync, writeFileSync } from "node:fs";
const OUT = "src/data/projects.json";
const p = JSON.parse(readFileSync(OUT, "utf8"));

const M = {
	"openboard-lecture-to-concept-map-automation-pipeline": ["Pipeline turning lecture recordings into concept maps — LLM + OCR extract concepts, NetworkX builds the graph, served to a self-hosted OpenBoard.", ["python","llm","ocr","networkx"]],
	"text-and-pdf-to-audiobook-converter": ["Converts text and PDFs into spoken audiobooks via edge-tts, with both a CLI and a tkinter GUI.", ["python","tts","tkinter","cli"]],
	"rkc-detroit-historical-canal-tour-and-tour-guide-manual": ["Designed a historical canal tour of Detroit and wrote the accompanying tour-guide training manual.", ["curriculum","writing","program-design"]],
	"rkc-coaching-records-and-fun-start-lesson-plans": ["Coaching records and 'Fun Start' beginner lesson plans for a rowing program.", ["coaching","lesson-plans","program-design"]],
	"american-energy-society-energy-startups-dashboard": ["Interactive D3/Plotly dashboard profiling energy-sector startups by funding, stage, and sector. Rebuilt here with entirely synthetic data.", ["d3","plotly","dataviz","javascript"]],
	"dominion-energy-summer-internship": ["Summer internship on Dominion Energy's design team — field visits, design reviews, and structured feedback.", ["internship","power-systems","design"]],
	"ece-4440-4991-capstone-autobleedr-automated-bicycle-brake-bl": ["Capstone proposal for AutoBleedr, an automated bicycle brake-bleeding machine.", ["capstone","mechatronics","hardware"]],
	"ece-4907-gupta-lab-rare-earth-element-recovery-from-hdds-res": ["Lab research on recovering rare-earth elements from scrapped hard drives using LIBS/EDS and laser ablation.", ["spectroscopy","materials","research"]],
	"sts-3020-policy-memo-1": ["Science-and-technology policy memo analyzing a current federal policy question.", ["policy","writing"]],
	"sts-3020-policy-memo-2": ["Policy memo on sustainable development and science-technology-innovation (STI) strategy.", ["policy","sustainability","writing"]],
	"sts-3020-policy-memo-3": ["Policy memo on NSF indirect-cost rates and federal research funding.", ["policy","research-funding","writing"]],
	"sts-3020-policy-memo-4": ["Policy memo on health agencies and rebuilding public confidence.", ["policy","public-health","writing"]],
	"sts-3020-issue-advocacy-deliverable-1-virginia-transit-prese": ["Issue-advocacy presentation and summary on Virginia transit (Charlottesville Area Transit).", ["policy","transit","advocacy"]],
	"sts-3020-issue-advocacy-deliverable-2-transportation-impact": ["Transportation IMPACT advocacy deliverable — building the case for local transit investment.", ["policy","transit","advocacy"]],
	"sts-3020-issue-advocacy-deliverable-4-impact-assembly-reflec": ["Reflections on the IMPACT assembly and the issue-advocacy campaign outcome.", ["policy","advocacy","reflection"]],
	"sts-3020-course-paper-problem-statement": ["Problem statement framing SMR nuclear regulation as the course-paper research question.", ["policy","nuclear","smr"]],
	"sts-3020-course-paper-presentation-poster": ["Presentation and poster: accelerating nuclear power through modular regulation.", ["policy","nuclear","poster"]],
	"sts-3020-course-paper-final-research-paper": ["Final research paper arguing for modular regulation to accelerate small modular reactor (SMR) deployment.", ["policy","nuclear","smr"]],
	"ece-3250-transformer-design-project": ["Transformer design project — Python design code plus an engineering report.", ["python","transformers","power"]],
	"ece-3250-research-project-advanced-transmission-grid-reliabi": ["Group research on advanced transmission technologies and grid reliability.", ["grid","transmission","research"]],
	"ece-3250-individual-research-report": ["Individual research report on an electromechanical energy-conversion topic.", ["power","research","writing"]],
	"ece-3251-lab-1-single-phase": ["Lab: single-phase transformer characterization and measurements.", ["power-lab","transformers"]],
	"ece-3251-lab-2-three-phase": ["Lab: three-phase transformer connections and measurements.", ["power-lab","three-phase"]],
	"ece-3251-lab-3-solenoid": ["Lab: solenoid actuator characterization.", ["power-lab","magnetics"]],
	"ece-3251-lab-4-magnetic-non-linearities": ["Lab: measuring magnetic non-linearities and hysteresis.", ["power-lab","magnetics"]],
	"ece-3251-lab-5-iron-core-transformers": ["Lab: iron-core transformer behavior and losses.", ["power-lab","transformers"]],
	"ece-3251-lab-6-reverse-engineering": ["Lab: reverse-engineering an unknown electromagnetic device from measurements.", ["power-lab","measurement"]],
	"ece-3251-lab-7-transformer-verification": ["Lab: verifying a transformer model against measured data.", ["power-lab","transformers"]],
	"ece-3251-lab-8-induction-machine": ["Lab: induction-machine testing and performance curves.", ["power-lab","machines"]],
	"ece-3251-lab-9-dc-machine": ["Lab: DC-machine characterization under varying load.", ["power-lab","machines"]],
	"ece-3251-lab-10-synchronous-machines": ["Lab: synchronous-machine testing and characteristic curves.", ["power-lab","machines"]],
	"ece-2300-applied-circuits-boost-converter-pcb-project": ["Designed and laid out a boost-converter PCB in KiCad, validated in Multisim.", ["pcb","kicad","power-electronics"]],
	"ece-2600-electronics-audio-analyzer-final-project": ["Final project: an audio analyzer built from discrete analog and mixed-signal stages.", ["analog","audio","electronics"]],
	"ece-2600-electronics-studios-1-8": ["Studio lab sequence covering core analog electronics building blocks.", ["analog","electronics","labs"]],
	"ece-2700-signals-and-systems-dc-ac-converter-final-project": ["Final project: a DC-AC converter (inverter) analyzed through a signals-and-systems lens.", ["power-electronics","signals","inverter"]],
	"ece-3430-embedded-systems-final-project": ["Embedded final project on a TI booster pack using SPI peripherals.", ["embedded","spi","firmware"]],
	"ece-3430-embedded-systems-final-project-video": ["Demo video for the Team 20 embedded-systems final project.", ["embedded","demo","video"]],
	"ece-3209-electromagnetic-fields-labs-1-6": ["Electromagnetic-fields lab sequence (Labs 1–6): measurement and field analysis.", ["em-fields","labs","measurement"]],
	"ece-4103-solid-state-devices-project-1": ["MATLAB project modeling solid-state device behavior for renewable-energy conversion.", ["matlab","semiconductors","modeling"]],
	"ece-4103-hw8-solar-cell-lab": ["Solar-cell characterization lab — I-V curves and efficiency.", ["solar","semiconductors","lab"]],
	"apma-3080-linear-algebra-project-1": ["MATLAB linear-algebra project applying matrix methods to an applied problem.", ["matlab","linear-algebra","numerics"]],
	"apma-3100-probability-project-1": ["Applied probability project — modeling and simulation of a stochastic problem.", ["probability","modeling"]],
	"apma-3100-probability-project-2": ["Probability project in a Jupyter notebook with report and appendix — simulation and analysis.", ["python","jupyter","probability"]],
	"ece-2410-intro-to-ml-final-project": ["Group ML final project predicting student performance with kNN and linear regression.", ["machine-learning","knn","regression"]],
	"ece-2330-digital-logic-design-learning-activities": ["Digital-logic learning activities (LA0–LA7) in FPGA/VHDL.", ["fpga","vhdl","digital-logic"]],
	"cs-2130-computer-systems-and-org-1-labs-1-13": ["Computer-systems lab sequence (Labs 1–13) in C — memory, systems programming, and tooling.", ["c","systems","labs"]],
	"hoohacks-2025": ["HooHacks 2025 hackathon — project ideation and topic brainstorming.", ["hackathon","ideation"]],
	"bio-2870-anatomy-lab-6-study-guide": ["Group-authored anatomy study guide for Lab 6.", ["biology","study-guide"]],
	"chm-111-general-chemistry-i-lab-reports": ["General Chemistry I lab reports — experiments, data, and analysis.", ["chemistry","lab-reports"]],
};

let n = 0;
for (const proj of p) {
	const m = M[proj.slug];
	if (!m) { console.warn("no summary:", proj.slug); continue; }
	proj.summary = m[0];
	proj.tags = m[1];
	n++;
}
writeFileSync(OUT, JSON.stringify(p, null, "\t") + "\n");
console.log("summaries+tags set for", n, "of", p.length);
