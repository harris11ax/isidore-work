// Fidelity check: the migrated content database must reproduce the site data
// that was committed before the migration. Compares every scalar field of every
// project record plus its asset list.
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const repo = process.cwd();
const before = JSON.parse(execSync('git show HEAD:src/data/projects.json', { cwd: repo, encoding: 'utf8' }));
const after = JSON.parse(fs.readFileSync('src/data/projects.json', 'utf8'));

const FIELDS = [
	'slug', 'name', 'date', 'domain', 'category', 'audience', 'effort', 'timeHours',
	'summary', 'cover', 'course', 'term', 'org', 'kind', 'status', 'redirectFrom',
];
const LISTS = ['tags', 'deliverables', 'tools'];

const bySlug = (rows) => new Map(rows.map((r) => [r.slug, r]));
const b = bySlug(before);
const a = bySlug(after);

console.log(`records before: ${before.length}   after: ${after.length}`);

const problems = [];
for (const slug of new Set([...b.keys(), ...a.keys()])) {
	if (!b.has(slug)) problems.push(`EXTRA record: ${slug}`);
	else if (!a.has(slug)) problems.push(`MISSING record: ${slug}`);
}

// asset srcs are content-addressed now, so compare counts and types, not paths
let assetCountBefore = 0;
let assetCountAfter = 0;
let typeMismatch = 0;
for (const [slug, rec] of a) {
	const old = b.get(slug);
	if (!old) continue;
	for (const f of FIELDS) {
		const o = old[f] ?? '';
		const n = rec[f] ?? '';
		if (o !== n) problems.push(`${slug}.${f}: ${JSON.stringify(o)} -> ${JSON.stringify(n)}`);
	}
	for (const f of LISTS) {
		const o = JSON.stringify(old[f] ?? []);
		const n = JSON.stringify(rec[f] ?? []);
		if (o !== n) problems.push(`${slug}.${f}: ${o} -> ${n}`);
	}
	assetCountBefore += (old.assets || []).length;
	assetCountAfter += (rec.assets || []).length;
	const oldTypes = (old.assets || []).map((x) => `${x.type}:${x.caption || ''}:${x.src}`).join('|');
	const newTypes = (rec.assets || []).map((x) => `${x.type}:${x.caption || ''}:${x.src}`).join('|');
	if (oldTypes !== newTypes) {
		typeMismatch++;
		problems.push(`${slug}.assets differ:\n      before ${oldTypes}\n      after  ${newTypes}`);
	}
}

console.log(`assets before: ${assetCountBefore}   after: ${assetCountAfter}   type-order mismatches: ${typeMismatch}`);
if (problems.length) {
	console.log(`\n${problems.length} difference(s):`);
	problems.slice(0, 40).forEach((p) => console.log('  - ' + p));
	process.exit(1);
}
console.log('\nFIDELITY OK — every field round-tripped through content.db unchanged.');
