// Rebuild assets[]/hasVisuals from the files actually present in
// public/projects/<slug>/ (local, no Google Drive). Also enforces 24MB cap.
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, rmSync } from "node:fs";
import { join, extname, basename } from "node:path";
const OUT = "src/data/projects.json";
const ROOT = "public/projects";
const CAP = 24 * 1024 * 1024;
const IMG = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);
const VID = new Set([".mp4", ".webm", ".mov"]);
const cap = (n) => basename(n, extname(n)).replace(/[_-]+/g, " ").trim().slice(0, 80);

const p = JSON.parse(readFileSync(OUT, "utf8"));
let stats = { img: 0, vid: 0, pdf: 0, embed: 0, visual: 0 };

for (const proj of p) {
	const dir = join(ROOT, proj.slug);
	const assets = [];
	if (existsSync(dir)) {
		const files = readdirSync(dir).filter((f) => !f.endsWith("-poster.jpg"));
		for (const f of files) {
			const full = join(dir, f);
			let size = 0; try { size = statSync(full).size; } catch {}
			if (size > CAP) { rmSync(full); continue; } // safety net
			const ext = extname(f).toLowerCase();
			const src = `/projects/${proj.slug}/${f}`;
			if (IMG.has(ext)) { assets.push({ type: "image", src, caption: cap(f) }); stats.img++; }
			else if (VID.has(ext)) {
				const poster = f.replace(/\.[^.]+$/, "") + "-poster.jpg";
				assets.push({ type: "video", src, thumb: existsSync(join(dir, poster)) ? `/projects/${proj.slug}/${poster}` : undefined, caption: cap(f) });
				stats.vid++;
			}
			else if (ext === ".pdf") { assets.push({ type: "pdf", src, caption: cap(f) }); stats.pdf++; }
			else if (ext === ".html") { assets.push({ type: "embed", src, caption: "Live demo (synthetic data)" }); stats.embed++; }
		}
	}
	// order: images, video, embed, pdf
	const rank = { image: 0, video: 1, embed: 2, pdf: 3 };
	assets.sort((a, b) => rank[a.type] - rank[b.type]);
	proj.assets = assets;
	proj.hasVisuals = assets.some((a) => a.type === "image" || a.type === "video" || a.type === "embed");
	if (proj.hasVisuals) stats.visual++;
}
writeFileSync(OUT, JSON.stringify(p, null, "\t") + "\n");
console.log(stats, "visual/total", stats.visual + "/" + p.length);
