// Walk each project's sourcePath, copy representative assets into
// public/projects/<slug>/, thumbnail images (sharp) + video posters (ffmpeg),
// and write assets[]/hasVisuals back into src/data/projects.json.
// Google-Drive cloud-only files / permission errors are skipped, not fatal.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, copyFileSync } from "node:fs";
import { join, extname, basename } from "node:path";
import { execFileSync } from "node:child_process";
import sharp from "sharp";

const OUT = "src/data/projects.json";
const PUBROOT = "public/projects";
const IMG = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);
const VID = new Set([".mp4", ".webm", ".mov"]);
const PDF = new Set([".pdf"]);
const SKIP_DIR = /node_modules|__pycache__|\.git|\.venv|dist|build|\.astro/i;
const CAP_IMG = 15 * 1024 * 1024;
const CAP_PDF = 40 * 1024 * 1024;
const CAP_VID = 24 * 1024 * 1024; // Cloudflare Workers per-asset limit ~25MiB
const MAXDEPTH = 4;
const MAX_IMGS = 4;
const FIG_HINT = /fig|plot|graph|chart|schematic|poster|result|output|layout|pcb|diagram|screenshot|spectr|wave|render|photo|image|scope|sim/i;

const projects = JSON.parse(readFileSync(OUT, "utf8"));

function walk(dir, depth, acc) {
	if (depth > MAXDEPTH) return;
	let entries;
	try { entries = readdirSync(dir, { withFileTypes: true }); }
	catch { return; }
	for (const e of entries) {
		if (e.name.startsWith("~$")) continue;
		const full = join(dir, e.name);
		if (e.isDirectory()) {
			if (SKIP_DIR.test(e.name)) continue;
			walk(full, depth + 1, acc);
		} else if (e.isFile()) {
			const ext = extname(e.name).toLowerCase();
			if (IMG.has(ext) || VID.has(ext) || PDF.has(ext)) {
				let size = 0;
				try { size = statSync(full).size; } catch { continue; }
				acc.push({ full, name: e.name, ext, size });
			}
		}
		if (acc.length > 6000) return;
	}
}

function rank(files, kindSet) {
	return files
		.filter((f) => kindSet.has(f.ext))
		.sort((a, b) => (FIG_HINT.test(b.name) ? 1 : 0) - (FIG_HINT.test(a.name) ? 1 : 0) || b.size - a.size);
}

let stats = { imgs: 0, pdfs: 0, vids: 0, visual: 0, empty: 0, errors: 0 };

for (const p of projects) {
	const src = p.sourcePath.replace(/[\\/]+$/, "");
	const isFile = /\.[a-z0-9]{2,4}$/i.test(src) && existsSync(src) && statSync(src).isFile?.();
	const files = [];
	try {
		if (isFile) {
			const ext = extname(src).toLowerCase();
			files.push({ full: src, name: basename(src), ext, size: statSync(src).size });
		} else if (existsSync(src)) {
			walk(src, 0, files);
		}
	} catch (e) { stats.errors++; }

	const dest = join(PUBROOT, p.slug);
	const assets = [];
	let copiedImg = 0;

	// images
	for (const f of rank(files, IMG).slice(0, MAX_IMGS)) {
		if (f.size > CAP_IMG && f.ext !== ".svg") continue;
		try {
			mkdirSync(dest, { recursive: true });
			const outName = safe(f.name);
			const rel = `/projects/${p.slug}/${outName}`;
			if (f.ext === ".svg" || f.ext === ".gif") {
				copyFileSync(f.full, join(dest, outName));
			} else {
				await sharp(f.full).resize({ width: 1400, withoutEnlargement: true }).toFile(join(dest, outName));
			}
			assets.push({ type: "image", src: rel, caption: cap(f.name) });
			copiedImg++; stats.imgs++;
		} catch { stats.errors++; }
	}

	// video (one, small enough)
	for (const f of rank(files, VID)) {
		if (f.size > CAP_VID) break;
		try {
			mkdirSync(dest, { recursive: true });
			const outName = safe(f.name);
			copyFileSync(f.full, join(dest, outName));
			const poster = outName.replace(/\.[^.]+$/, "") + "-poster.jpg";
			try {
				execFileSync("ffmpeg", ["-y", "-i", join(dest, outName), "-ss", "00:00:01", "-vframes", "1", "-vf", "scale=1000:-1", join(dest, poster)], { stdio: "ignore" });
			} catch {}
			assets.push({ type: "video", src: `/projects/${p.slug}/${outName}`, thumb: existsSync(join(dest, poster)) ? `/projects/${p.slug}/${poster}` : undefined, caption: cap(f.name) });
			stats.vids++;
		} catch { stats.errors++; }
		break;
	}

	// pdf (one main deliverable) — download tile, no raster thumb available
	for (const f of rank(files, PDF)) {
		if (f.size > CAP_PDF) break;
		try {
			mkdirSync(dest, { recursive: true });
			const outName = safe(f.name);
			copyFileSync(f.full, join(dest, outName));
			assets.push({ type: "pdf", src: `/projects/${p.slug}/${outName}`, caption: cap(f.name) });
			stats.pdfs++;
		} catch { stats.errors++; }
		break;
	}

	p.assets = assets;
	p.hasVisuals = copiedImg > 0 || assets.some((a) => a.type === "video");
	if (p.hasVisuals) stats.visual++; else stats.empty++;
	console.log(`${p.hasVisuals ? "V" : "·"} ${p.slug.slice(0, 42).padEnd(42)} img:${copiedImg} ${assets.map((a) => a.type).join(",")}`);
}

writeFileSync(OUT, JSON.stringify(projects, null, "\t") + "\n");
console.log("\n", stats);

function safe(n) { return n.replace(/[^a-zA-Z0-9._-]+/g, "_"); }
function cap(n) { return basename(n, extname(n)).replace(/[_-]+/g, " ").trim().slice(0, 80); }
