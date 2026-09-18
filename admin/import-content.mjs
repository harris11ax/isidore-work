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
	// One transaction for the whole import: a failure must never leave the content
	// tables cleared. The rollback also happens on an uncaught exception, because
	// the process exits with the transaction still open.
	db.exec('BEGIN IMMEDIATE');
	let committed = false;
	process.on('exit', () => {
		if (!committed) {
			try {
				db.exec('ROLLBACK');
				console.error('import failed — rolled back, nothing was changed');
			} catch {
				/* nothing to roll back */
			}
		}
	});
	db.commit = () => {
		committed = true;
		db.exec('COMMIT');
	};

	for (const t of ['assets', 'project_roles', 'projects', 'roles', 'education', 'domains']) {
		db.exec(`DELETE FROM ${t}`);
	}
	console.log('cleared content tables');
} else {
	// Fresh database: nothing to roll back to, so no transaction — but db.commit()
	// must still exist. (Opening a transaction and never committing it here would
	// silently discard the entire import on exit.)
	db.commit = () => {};
}

// The site's own modules are plain ES modules, so the importer reads the real
// thing rather than a paraphrase of it.
const [rolesMod, domainsMod] = await Promise.all([
	import(path.join(dataDir, 'roles.ts')),
	import(path.join(dataDir, 'domains.ts')),
]);

// src/consts.ts now re-exports the *generated* src/data/site, which does not
// exist until the first generate runs — so look for the values in, in order:
//   1. the working tree (works once src/data/site.ts has been generated)
//   2. the most recent commit whose src/consts.ts still had literal values
//   3. hard defaults (so a key can never bind `undefined`)
// The migration is a one-time job; being able to walk back through history is what
// keeps it re-runnable after the file has been converted.
const CONST_KEYS = ['SITE_TITLE', 'SITE_DESCRIPTION', 'EMAIL', 'EMAIL2', 'GITHUB_URL', 'LINKEDIN_URL'];
const CONST_DEFAULTS = {
	SITE_TITLE: 'isidore.work',
	SITE_DESCRIPTION: '',
	EMAIL: '',
	EMAIL2: '',
	GITHUB_URL: '',
	LINKEDIN_URL: '',
};

const parseConsts = (text) => {
	const out = {};
	for (const m of text.matchAll(/export\s+const\s+([A-Z0-9_]+)\s*=\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g)) {
		if (!CONST_KEYS.includes(m[1])) continue;
		try {
			out[m[1]] = JSON.parse(m[2].replace(/^'/, '"').replace(/'$/, '"'));
		} catch {
			out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
		}
	}
	return out;
};

const git = (args) => spawnSync('git', args, { cwd: REPO, encoding: 'utf8' });

async function readConsts() {
	let source = '';
	const found = {};

	// 1. the working tree, if it still holds literals or site.ts exists
	try {
		const mod = await import(path.join(REPO, 'src', 'consts.ts'));
		for (const key of CONST_KEYS) {
			if (typeof mod[key] === 'string' && mod[key] !== '') found[key] = mod[key];
		}
		if (Object.keys(found).length) source = 'the working tree';
	} catch {
		/* consts.ts imports a file that does not exist yet */
	}

	// 2. walk back through the commits that touched src/consts.ts
	if (!source) {
		const log = git(['log', '-n', '25', '--format=%H', '--', 'src/consts.ts']);
		for (const sha of (log.stdout || '').split('\n').map((s) => s.trim()).filter(Boolean)) {
			const show = git(['show', `${sha}:src/consts.ts`]);
			if (show.status !== 0) continue;
			const parsed = parseConsts(show.stdout || '');
			if (Object.keys(parsed).length) {
				Object.assign(found, parsed);
				source = `${sha.slice(0, 7)}:src/consts.ts`;
				break;
			}
		}
	}

	const merged = { ...CONST_DEFAULTS, ...found };
	console.log(`consts read from: ${source || 'defaults'} (${Object.keys(found).length}/${CONST_KEYS.length} found)`);
	return merged;
}

const constsMod = await readConsts();

const projects = JSON.parse(fs.readFileSync(path.join(dataDir, 'projects.json'), 'utf8'));

// ROLE_BY_SLUG lived in professional.ts as a hand-written literal. The working
// copy now imports the generated map instead, so walk back to the most recent
// commit whose professional.ts still carried the literal.
function committedRoleMap() {
	const log = spawnSync('git', ['log', '-n', '25', '--format=%H', '--', 'src/data/professional.ts'], {
		cwd: REPO,
		encoding: 'utf8',
	});
	for (const sha of (log.stdout || '').split('\n').map((s) => s.trim()).filter(Boolean)) {
		const res = spawnSync('git', ['show', `${sha}:src/data/professional.ts`], { cwd: REPO, encoding: 'utf8' });
		if (res.status !== 0) continue;
		const out = {};
		for (const m of (res.stdout || '').matchAll(/['"]([a-z0-9-]+)['"]\s*:\s*['"]([A-Z]\d+)['"]/g)) {
			out[m[1]] = m[2];
		}
		if (Object.keys(out).length) {
			console.log(`role anchors read from: ${sha.slice(0, 7)}:src/data/professional.ts`);
			return out;
		}
	}
	return {};
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
db.commit();
console.log('import committed');
