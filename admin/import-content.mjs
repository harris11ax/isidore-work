// One-time import: the site's committed data + the local portfolio database
// become rows in content.db. After this runs the database is the source of
// truth and portfolio_db/export_site.py is only a historical importer.
//
//   node admin/import-content.mjs            # refuses to clobber a non-empty database
//   node admin/import-content.mjs --force    # wipe the content tables and re-import
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO, db, now, setSetting, storeMedia, MEDIA_DIR } from './db.mjs';

const force = process.argv.includes('--force');
const dataDir = path.join(REPO, 'src', 'data');
const publicDir = path.join(REPO, 'public');

const count = db.prepare('SELECT COUNT(*) AS n FROM projects').get().n;
if (count > 0 && !force) {
	console.log(`projects table already holds ${count} rows — pass --force to re-import.`);
	process.exit(0);
}

if (force) {
	for (const t of ['assets', 'project_roles', 'projects', 'roles', 'education', 'domains']) {
		db.exec(`DELETE FROM ${t}`);
	}
	console.log('cleared content tables');
}

// The site's own modules are plain ES modules, so the importer reads the real
// thing rather than a paraphrase of it.
const [rolesMod, domainsMod] = await Promise.all([
	import(path.join(dataDir, 'roles.ts')),
	import(path.join(dataDir, 'domains.ts')),
]);

// src/consts.ts now re-exports the *generated* src/data/site, which does not
// exist until the first generate runs — so take the pre-migration values from
// the last commit instead.
function committedConsts() {
	const res = spawnSync('git', ['show', 'HEAD:src/consts.ts'], { cwd: REPO, encoding: 'utf8' });
	const out = {};
	if (res.status !== 0) return out;
	for (const m of res.stdout.matchAll(/export\s+const\s+([A-Z0-9_]+)\s*=\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g)) {
		try {
			out[m[1]] = JSON.parse(m[2].replace(/^'/, '"').replace(/'$/, '"'));
		} catch {
			out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
		}
	}
	return out;
}

const constsMod = committedConsts();
console.log(`consts read from HEAD: ${Object.keys(constsMod).join(', ') || '(none found)'}`);

const projects = JSON.parse(fs.readFileSync(path.join(dataDir, 'projects.json'), 'utf8'));

// ROLE_BY_SLUG lived in professional.ts as a hand-written literal. The working
// copy now imports the generated map instead, so read the pre-migration literal
// out of the last commit.
function committedRoleMap() {
	const res = spawnSync('git', ['show', 'HEAD:src/data/professional.ts'], { cwd: REPO, encoding: 'utf8' });
	const out = {};
	if (res.status !== 0) return out;
	for (const m of res.stdout.matchAll(/['"]([a-z0-9-]+)['"]\s*:\s*['"]([A-Z]\d+)['"]/g)) {
		out[m[1]] = m[2];
	}
	return out;
}
const roleBySlug = committedRoleMap();

const ts = now();

// ------------------------------------------------------------- settings ----
const landingDefaults = {
	landing_name: 'Isidore LaRocco',
	landing_selfie: '/blog-placeholder-about.jpg',
	landing_selfie_caption: 'Placeholder — selfie to come.',
	landing_bio: [
		'Electrical &amp; computer engineering student at the University of Virginia, after four years as an MH-53E Sea Dragon airframe mechanic in the U.S. Navy. Work across power &amp; energy systems, embedded hardware, software &amp; data, lab research and science-and-technology policy.',
		'Most recently a research intern at the American Energy Society, tracking energy-tech startups; before that a summer design internship at Dominion Energy and a DoD Skillbridge electrical-assembly placement at Fairlead Integrated Solutions.',
	],
	work_heading: 'Professional Work',
	work_blurb:
		'Roles held for an employer or institution — {count} records, newest first. Each entry links to its full write-up with the documents and images that came out of it.',
	more_heading: 'Everything else',
	more_blurb:
		'Coursework, personal builds, research and volunteer programmes — {count} more records, filterable by domain and category. Roles, awards and credentials are on the <a href="/cv">CV page</a>.',
	contact_heading: 'Get in touch',
	contact_blurb:
		'Email is the fastest way to reach me; LinkedIn works too. The <a href="/contact">contact page</a> lists both addresses.',
};

const settings = {
	site_title: constsMod.SITE_TITLE,
	site_description: constsMod.SITE_DESCRIPTION,
	email: constsMod.EMAIL,
	email2: constsMod.EMAIL2,
	github_url: constsMod.GITHUB_URL,
	linkedin_url: constsMod.LINKEDIN_URL,
	instagram_url: '',
	categories: [...domainsMod.CATEGORIES],
	...landingDefaults,
};
for (const [key, value] of Object.entries(settings)) setSetting(key, value);
console.log(`settings: ${Object.keys(settings).length}`);

// -------------------------------------------------------------- domains ----
const insertDomain = db.prepare(
	'INSERT INTO domains (slug, label, blurb, color, sort_order) VALUES (?, ?, ?, ?, ?)',
);
domainsMod.DOMAINS.forEach((d, i) => insertDomain.run(d.slug, d.label, d.blurb, d.color, i));
console.log(`domains: ${domainsMod.DOMAINS.length}`);

// --------------------------------------------------------------- roles -----
const insertRole = db.prepare(`INSERT INTO roles
	(id, title, org, location, kind, start, end, current, employment, summary, achievements, skills, tools, sort_order)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
rolesMod.ROLES.forEach((r, i) =>
	insertRole.run(
		r.id,
		r.title || '',
		r.org || '',
		r.location || '',
		r.kind || 'Role',
		r.start || '',
		r.end || '',
		r.current ? 1 : 0,
		r.employment || '',
		r.summary || '',
		JSON.stringify(r.achievements || []),
		JSON.stringify(r.skills || []),
		JSON.stringify(r.tools || []),
		i,
	),
);
console.log(`roles: ${rolesMod.ROLES.length}`);

const insertEducation = db.prepare(
	'INSERT INTO education (institution, from_text, to_text, current, sort_order) VALUES (?, ?, ?, ?, ?)',
);
(rolesMod.EDUCATION || []).forEach((e, i) =>
	insertEducation.run(e.institution, e.from || '', e.to || '', e.current ? 1 : 0, i),
);
console.log(`education: ${(rolesMod.EDUCATION || []).length}`);

// ------------------------------------------------------------ projects -----
const insertProject = db.prepare(`INSERT INTO projects
	(slug, name, date, domain_slug, category, audience, effort, time_hours, summary, body, cover,
	 accent_color, tags, course, term, org, kind, status, deliverables, tools, redirect_from,
	 featured, visible, sort_order, created_at, updated_at)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const insertAsset = db.prepare(
	'INSERT INTO assets (project_id, type, media_id, src, caption, thumb, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
);
const insertProjectRole = db.prepare(
	'INSERT INTO project_roles (project_slug, role_id) VALUES (?, ?) ON CONFLICT(project_slug) DO UPDATE SET role_id = excluded.role_id',
);

/**
 * Bring an existing file in public/ into the media store so the admin UI can
 * manage it. Files already under /projects/<slug>/ keep their published URL.
 */
function importMedia(src) {
	if (!src || /^https?:/i.test(src)) return null;
	if (src.startsWith('/media/')) {
		const file = path.join(publicDir, src.replace(/^\//, ''));
		if (!fs.existsSync(file)) return null;
		return storeMedia(fs.readFileSync(file), path.basename(src), mimeFor(src));
	}
	const file = path.join(publicDir, src.replace(/^\//, ''));
	if (!fs.existsSync(file)) return null;
	return storeMedia(fs.readFileSync(file), path.basename(src), mimeFor(src));
}

function mimeFor(file) {
	const ext = path.extname(file).toLowerCase();
	return (
		{
			'.png': 'image/png',
			'.jpg': 'image/jpeg',
			'.jpeg': 'image/jpeg',
			'.gif': 'image/gif',
			'.webp': 'image/webp',
			'.svg': 'image/svg+xml',
			'.pdf': 'application/pdf',
			'.mp4': 'video/mp4',
			'.webm': 'video/webm',
		}[ext] || 'application/octet-stream'
	);
}

let assetCount = 0;
let mediaCount = 0;
projects.forEach((p, index) => {
	insertProject.run(
		p.slug,
		p.name || p.slug,
		p.date || '',
		p.domain || '',
		p.category || 'Personal',
		p.audience || '',
		p.effort || '',
		p.timeHours || '',
		p.summary || '',
		p.body || '',
		p.cover || '',
		p.accentColor || '',
		JSON.stringify(p.tags || []),
		p.course || '',
		p.term || '',
		p.org || '',
		p.kind || '',
		p.status || '',
		JSON.stringify(p.deliverables || []),
		JSON.stringify(p.tools || []),
		p.redirectFrom || '',
		p.featured ? 1 : 0,
		1,
		index,
		ts,
		ts,
	);
	const row = db.prepare('SELECT id FROM projects WHERE slug = ?').get(p.slug);

	if (p.cover) {
		const media = importMedia(p.cover);
		if (media) {
			mediaCount++;
			db.prepare('UPDATE projects SET cover = ? WHERE id = ?').run(`media:${media.id}`, row.id);
		}
	}

	(p.assets || []).forEach((a, i) => {
		let src = a.src || '';
		let mediaId = null;
		if (src && !/^https?:/i.test(src)) {
			const media = importMedia(src);
			if (media) {
				mediaId = media.id;
				mediaCount++;
				src = `media:${media.id}`;
			}
		}
		insertAsset.run(row.id, a.type || 'image', mediaId, src, a.caption || '', a.thumb || '', i);
		assetCount++;
	});

	if (roleBySlug[p.slug]) insertProjectRole.run(p.slug, roleBySlug[p.slug]);
});

console.log(`projects: ${projects.length}`);
console.log(`assets: ${assetCount}`);
console.log(`media files ingested: ${mediaCount}`);
console.log(`role anchors: ${Object.keys(roleBySlug).length}`);
console.log(`media dir: ${MEDIA_DIR}`);
