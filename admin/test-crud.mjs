// Functional test of the admin portal's actual job: create a project, upload an
// image, edit it, recolour a domain, then delete it — asserting each step lands in
// content.db AND in the generated site data, then restoring the original state.
//
//   node admin/test-crud.mjs "<password>"  [baseUrl]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from './db.mjs';

const BASE = process.argv[3] || 'http://127.0.0.1:8099';
const PASSWORD = process.argv[2];
if (!PASSWORD) {
	console.error('usage: node admin/test-crud.mjs <password> [base]');
	process.exit(2);
}

let pass = 0;
let fail = 0;
const ok = (label, extra = '') => {
	console.log(`  ok    ${label}${extra ? `  ${extra}` : ''}`);
	pass++;
};
const bad = (label, extra = '') => {
	console.log(`  FAIL  ${label}${extra ? `  ${extra}` : ''}`);
	fail++;
};
const assert = (cond, label, extra = '') => (cond ? ok(label, extra) : bad(label, extra));

let cookie = '';
const html = (body) => ({ 'content-type': 'application/x-www-form-urlencoded', ...(cookie ? { cookie } : {}) });

async function get(pathname) {
	const res = await fetch(BASE + pathname, { headers: cookie ? { cookie } : {}, redirect: 'manual' });
	const setCookie = res.headers.getSetCookie?.() || [];
	for (const c of setCookie) cookie = c.split(';')[0];
	return { status: res.status, text: await res.text() };
}

async function post(pathname, body) {
	// Let fetch set the multipart boundary itself; only urlencoded bodies get an
	// explicit content-type.
	const headers = { origin: BASE, ...(cookie ? { cookie } : {}) };
	if (body instanceof URLSearchParams) headers['content-type'] = 'application/x-www-form-urlencoded';
	const res = await fetch(BASE + pathname, {
		method: 'POST',
		headers,
		body,
		redirect: 'manual',
	});
	const setCookie = res.headers.getSetCookie?.() || [];
	for (const c of setCookie) cookie = c.split(';')[0];
	const location = res.headers.get('location') || '';
	return { status: res.status, location, text: await res.text() };
}

const csrfOf = (page) => (page.match(/name="_csrf" value="([^"]+)"/) || [])[1] || '';
const generate = () => {
	const res = spawnSync(process.execPath, ['--no-warnings', path.join(REPO, 'admin', 'generate.mjs')], {
		cwd: REPO,
		encoding: 'utf8',
	});
	return `${res.stdout}${res.stderr}`;
};
const readData = () => JSON.parse(fs.readFileSync(path.join(REPO, 'src', 'data', 'projects.json'), 'utf8'));
const readDomains = () => fs.readFileSync(path.join(REPO, 'src', 'data', 'domains.ts'), 'utf8');

console.log('== sign in ==');
const loginPage = await get('/admin/login');
const login = await post('/admin/login', new URLSearchParams({ _csrf: csrfOf(loginPage.text), password: PASSWORD }));
assert(login.status === 302, 'signed in', `-> ${login.location}`);

console.log('\n== create a project with an uploaded image ==');
const newForm = await get('/admin/projects/new');
const csrf = csrfOf(newForm.text);
assert(Boolean(csrf), 'new-project form has a CSRF token');

// smallest valid PNG
const png = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
	'base64',
);
const form = new FormData();
form.set('_csrf', csrf);
form.set('name', 'CRUD Test Project');
form.set('slug', 'crud-test-project');
form.set('date', '2026-09-18');
form.set('domain_slug', 'software-data');
form.set('category', 'Personal');
form.set('summary', 'Created by admin/test-crud.mjs.');
form.set('tags', 'test\ntemporary');
form.set('accent_color', '#ff00aa');
form.set('visible', '1');
form.set('new_type', 'image');
form.set('new_caption', 'uploaded test image');
form.set('new_files', new Blob([png], { type: 'image/png' }), 'crud-test.png');

const created = await post('/admin/projects/new', form);
assert(created.status === 302, 'project created', `-> ${created.location}`);
const projectId = (created.location.match(/\/admin\/projects\/(\d+)/) || [])[1];
assert(Boolean(projectId), 'redirected to the new project', `id=${projectId}`);

let gen = generate();
console.log('    ' + gen.trim());
let data = readData();
let record = data.find((p) => p.slug === 'crud-test-project');
assert(Boolean(record), 'appears in src/data/projects.json');
assert(record?.name === 'CRUD Test Project', 'title round-tripped');
assert(record?.accentColor === '#ff00aa', 'per-project accent colour round-tripped', record?.accentColor);
assert(record?.tags?.join(',') === 'test,temporary', 'tags round-tripped');
assert(record?.assets?.length === 1, 'the uploaded image became an asset');
assert(Boolean(record?.assets?.[0]?.src?.startsWith('/projects/crud-test-project/')), 'asset has a published URL', record?.assets?.[0]?.src);
const publishedFile = path.join(REPO, 'public', record.assets[0].src.replace(/^\//, ''));
assert(fs.existsSync(publishedFile), 'the image file was copied into public/');

console.log('\n== edit it ==');
const editForm = await get(`/admin/projects/${projectId}`);
const editCsrf = csrfOf(editForm.text);
const edit = new URLSearchParams();
edit.set('_csrf', editCsrf);
edit.set('name', 'CRUD Test Project (renamed)');
edit.set('slug', 'crud-test-project');
edit.set('date', '2026-09-18');
edit.set('domain_slug', 'research-lab');
edit.set('category', 'Personal');
edit.set('summary', 'Edited by the test.');
edit.set('tags', 'test');
edit.set('accent_color', '#00ff88');
edit.set('effort', 'Low');
edit.set('time_hours', '1');
edit.set('visible', '1');
edit.set('asset_order', '');
const edited = await post(`/admin/projects/${projectId}`, edit);
assert(edited.status === 302, 'edit saved');
gen = generate();
data = readData();
record = data.find((p) => p.slug === 'crud-test-project');
assert(record?.name === 'CRUD Test Project (renamed)', 'new title is in the built data');
assert(record?.domain === 'research-lab', 'domain change is in the built data');
assert(record?.accentColor === '#00ff88', 'accent colour change is in the built data');
assert(record?.effort === 'Low' && record?.timeHours === '1', 'effort/hours round-tripped');

console.log('\n== recolour a domain ==');
const domainsPage = await get('/admin/domains');
const domCsrf = csrfOf(domainsPage.text);
const originalColor = (readDomains().match(/slug: "power-energy".*?color: "(#[0-9a-f]{6})"/s) || [])[1];
const domForm = new URLSearchParams();
domForm.set('_csrf', domCsrf);
domForm.set('label_power-energy', 'Power & Energy Systems');
domForm.set('blurb_power-energy', 'Machines, transformers, converters, grid & renewables.');
domForm.set('color_power-energy', '#123456');
const savedDomain = await post('/admin/domains', domForm);
assert(savedDomain.status === 302 && savedDomain.location.includes('ok='), 'domain saved', `-> ${savedDomain.location}`);
gen = generate();
assert(readDomains().includes('"#123456"'), 'new domain colour is in src/data/domains.ts');
ok('original colour captured for restore', originalColor);

console.log('\n== hide and restore visibility ==');
const hideForm = new URLSearchParams(edit);
hideForm.set('_csrf', csrfOf((await get(`/admin/projects/${projectId}`)).text));
hideForm.delete('visible');
await post(`/admin/projects/${projectId}`, hideForm);
gen = generate();
assert(!readData().some((p) => p.slug === 'crud-test-project'), 'a hidden project is omitted from the build');

console.log('\n== delete it and restore the domain colour ==');
const delCsrf = csrfOf((await get('/admin/projects')).text) || csrfOf((await get(`/admin/projects/${projectId}`)).text);
const del = await post(`/admin/projects/${projectId}/delete`, new URLSearchParams({ _csrf: delCsrf }));
assert(del.status === 302, 'project deleted', `-> ${del.location}`);

const restore = new URLSearchParams();
restore.set('_csrf', csrfOf((await get('/admin/domains')).text));
restore.set('label_power-energy', 'Power & Energy Systems');
restore.set('blurb_power-energy', 'Machines, transformers, converters, grid & renewables.');
restore.set('color_power-energy', originalColor);
await post('/admin/domains', restore);

gen = generate();
data = readData();
assert(!data.some((p) => p.slug === 'crud-test-project'), 'deleted project is gone from the build');
assert(readDomains().includes(`"${originalColor}"`), 'domain colour restored');
assert(!fs.existsSync(publishedFile), 'the published image was cleaned up');
console.log('    ' + gen.trim());

console.log(`\npassed: ${pass}   failed: ${fail}`);
process.exit(fail === 0 ? 0 : 1);
