// One-off content migration for the September 2026 review of isidore.work.
// Three independent, individually-guarded sections — re-running is safe.
//
//   node admin/apply-review-fixes.mjs           # dry run (default): prints every change
//   node admin/apply-review-fixes.mjs --apply   # writes to content.db
//
// 1. Landing copy: the site title becomes the person's name (not the domain), the
//    "Placeholder — selfie to come." caption goes, and an availability line is added.
// 2. Domain accent colours: four of the seven failed WCAG AA as chip/heading text
//    (2.96–4.40:1). Darkened within the same hue — all now 4.78–5.78:1 on #fafafa.
// 3. ECE 3251: ten per-lab records folded into one course record, matching how
//    ECE 3209 (Labs 1-6), ECE 2600 (Studios 1-8) and CHM 111 are already stored.
//    Assets are re-pointed and re-captioned, never dropped; old URLs 301 via
//    public/_redirects. Run admin/generate.mjs afterwards (publish.mjs does it).
import { db, now, audit, getSetting, setSetting } from './db.mjs';

const apply = process.argv.includes('--apply');
const changes = [];
let failures = 0;

// ------------------------------------------------------------ 1. landing copy --
const SETTINGS = {
	site_title: 'Isidore LaRocco',
	landing_selfie_caption: '',
	landing_availability: 'Open to Summer 2027 internships',
};

for (const [key, value] of Object.entries(SETTINGS)) {
	const current = getSetting(key, null);
	if (current === value) continue;
	changes.push(`setting ${key}: ${JSON.stringify(current)} -> ${JSON.stringify(value)}`);
	if (apply) setSetting(key, value);
}

// --------------------------------------------------------- 2. domain colours --
// Same hue, one step darker; each value verified >= 4.5:1 on #fafafa and for white
// text on the filled chip.
const COLOURS = {
	'research-lab': '#0f766e',   // was #0d9488 — 3.59:1
	'policy-writing': '#4d7c0f', // was #65a30d — 2.96:1
	'teaching-field': '#be185d', // was #db2777 — 4.40:1
	'creative-media': '#0e7490', // was #0891b2 — 3.53:1
};

for (const [slug, color] of Object.entries(COLOURS)) {
	const row = db.prepare('SELECT color FROM domains WHERE slug = ?').get(slug);
	if (!row) {
		console.log(`WARN: no domain row for ${slug}`);
		failures++;
		continue;
	}
	if (row.color === color) continue;
	changes.push(`domain ${slug}: ${row.color} -> ${color}`);
	if (apply) db.prepare('UPDATE domains SET color = ? WHERE slug = ?').run(color, slug);
}

// ------------------------------------------------------ 3. the ECE 3251 merge --
const MERGED_SLUG = 'ece-3251-electric-machines-labs-1-10';
const labNum = (slug) => Number((slug.match(/ece-3251-lab-(\d+)/) || [])[1] || 0);
// Only the actual lab reports are safe to re-caption from the record's own summary;
// the two ECE 3250 lecture decks keep their own wording.
const isReport = (caption) => /^(ece3251 lab|lab\d+ report)/i.test(String(caption).trim());
const topic = (summary) => String(summary).replace(/^lab:\s*/i, '').replace(/\.\s*$/, '');

const labs = db
	.prepare("SELECT * FROM projects WHERE slug LIKE 'ece-3251-lab-%'")
	.all()
	.sort((a, b) => labNum(a.slug) - labNum(b.slug));
const alreadyMerged = db.prepare('SELECT id FROM projects WHERE slug = ?').get(MERGED_SLUG);

let mergedRecord = null;
const assetPlan = [];
if (alreadyMerged) {
	console.log(`(merge already applied: ${MERGED_SLUG} exists)`);
} else if (!labs.length) {
	console.log('(merge: no ece-3251-lab-* records found — nothing to fold)');
} else {
	const first = labs[0];
	const tags = [...new Set(labs.flatMap((l) => { try { return JSON.parse(l.tags); } catch { return []; } }))];
	for (const lab of labs) {
		for (const a of db.prepare('SELECT * FROM assets WHERE project_id = ? ORDER BY sort_order, id').all(lab.id)) {
			assetPlan.push({
				id: a.id,
				was: a.caption,
				becomes: isReport(a.caption)
					? `Lab ${labNum(lab.slug)} — ${topic(lab.summary)} (report)`
					: `Lab ${labNum(lab.slug)} — ${a.caption || a.type}`,
				sort_order: assetPlan.length,
			});
		}
	}
	mergedRecord = {
		slug: MERGED_SLUG,
		name: 'ECE 3251 Electric Machines and Transformers - Labs 1-10',
		date: first.date,
		domain_slug: first.domain_slug,
		category: first.category,
		audience: first.audience,
		effort: first.effort,
		time_hours: '30', // ten labs recorded at 2-4 h each
		summary:
			'Transformers, magnetics and electric machines lab sequence (Labs 1–10): connections, non-linearities and machine characterisation.',
		body: '',
		cover: '',
		accent_color: '',
		tags: JSON.stringify(tags),
		course: first.course,
		term: first.term,
		org: first.org,
		kind: first.kind,
		status: '',
		deliverables: '[]',
		tools: '[]',
		redirect_from: '',
		featured: 0,
		visible: 1,
		sort_order: first.sort_order,
	};
	changes.push(
		`create ${MERGED_SLUG}: moves ${assetPlan.length} assets from ${labs.length} records ` +
			`(${labs.map((l) => l.slug).join(', ')})`,
	);
}

// ------------------------------------------------------------------- report ----
if (!changes.length) {
	console.log('nothing to do — the database already matches the review changes.');
	process.exit(failures ? 1 : 0);
}
console.log(apply ? 'APPLYING:' : 'DRY RUN — planned changes:');
for (const c of changes) console.log(`  - ${c}`);
if (assetPlan.length) {
	console.log('\nasset re-captioning:');
	for (const a of assetPlan) console.log(`  ${a.sort_order + 1}. "${a.was}" -> "${a.becomes}"`);
}
if (mergedRecord) {
	console.log('\nmerged record fields:');
	for (const [k, v] of Object.entries(mergedRecord)) console.log(`  ${k}: ${JSON.stringify(v)}`);
}

if (!apply) {
	console.log('\nNothing written. Re-run with --apply.');
	process.exit(failures ? 1 : 0);
}

if (mergedRecord) {
	const ts = now();
	db.exec('BEGIN');
	try {
		const info = db
			.prepare(
				`INSERT INTO projects (slug, name, date, domain_slug, category, audience, effort, time_hours,
				 summary, body, cover, accent_color, tags, course, term, org, kind, status, deliverables, tools,
				 redirect_from, featured, visible, sort_order, created_at, updated_at)
				 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
			)
			.run(
				mergedRecord.slug, mergedRecord.name, mergedRecord.date, mergedRecord.domain_slug,
				mergedRecord.category, mergedRecord.audience, mergedRecord.effort, mergedRecord.time_hours,
				mergedRecord.summary, mergedRecord.body, mergedRecord.cover, mergedRecord.accent_color,
				mergedRecord.tags, mergedRecord.course, mergedRecord.term, mergedRecord.org, mergedRecord.kind,
				mergedRecord.status, mergedRecord.deliverables, mergedRecord.tools, mergedRecord.redirect_from,
				mergedRecord.featured, mergedRecord.visible, mergedRecord.sort_order, ts, ts,
			);
		const newId = Number(info.lastInsertRowid);
		const move = db.prepare('UPDATE assets SET project_id = ?, caption = ?, sort_order = ? WHERE id = ?');
		for (const a of assetPlan) move.run(newId, a.becomes, a.sort_order, a.id);
		for (const lab of labs) db.prepare('DELETE FROM projects WHERE id = ?').run(lab.id);
		const kept = db.prepare('SELECT COUNT(*) n FROM assets WHERE project_id = ?').get(newId).n;
		if (kept !== assetPlan.length) {
			throw new Error(`expected ${assetPlan.length} assets on the merged record, found ${kept}`);
		}
		audit('merge-projects', `${MERGED_SLUG}: folded ${labs.length} lab records into one, moved ${kept} assets`);
		db.exec('COMMIT');
		console.log(`\nmerged: project id ${newId}, ${kept} assets, ${labs.length} records removed`);
	} catch (err) {
		db.exec('ROLLBACK');
		console.error('MERGE FAILED, rolled back:', err.message);
		process.exit(1);
	}
}

audit('review-fixes', changes.length + ' change(s) applied from apply-review-fixes.mjs');
console.log('done.');
