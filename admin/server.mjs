// The isidore.work admin portal.
//
// Served on izzyserver (default 127.0.0.1:8099) and reached at
// https://isidore.work/admin through the Cloudflare tunnel: the deployed Worker
// proxies /admin/* here, path-preserving.
import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
	CONTENT_DIR,
	MEDIA_DIR,
	db,
	now,
	audit,
	getSetting,
	setSetting,
	allSettings,
	listDomains,
	listProjects,
	listRoles,
	listEducation,
	getProject,
	assetsFor,
	assetsFor as _assetsFor,
	roleIdForProject,
	projectBySlug,
	recentAudit,
	storeMedia,
	mediaById,
} from './db.mjs';
import {
	AUTH_FILE,
	authExists,
	verifyPassword,
	issueSession,
	readSession,
	cookieHeader,
	csrfFor,
	checkCsrf,
	recordAttempt,
	lockoutRemaining,
	clearAttempts,
} from './auth.mjs';
import { layout, loginPage, esc } from './views.mjs';
import {
	overview,
	landing,
	projects as projectsPage,
	projectForm,
	domainsPage,
	cvPage,
	contactPage,
	mediaPage,
	publishPage,
	activityPage,
} from './pages.mjs';
import { runPublish, lastPublishLog, repoStatus } from './publish.mjs';

const PORT = Number(process.env.PORT || 8099);
const HOST = process.env.HOST || '127.0.0.1';
const REQUIRE_PROXY = process.env.REQUIRE_PROXY === '1';
const PROXY_SECRET = process.env.ADMIN_PROXY_SECRET || '';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 30 * 1024 * 1024, files: 20 },
});

app.use('/admin', express.urlencoded({ extended: false, limit: '2mb' }));
app.use('/admin', express.json({ limit: '2mb' }));

// ------------------------------------------------------------ proxy guard ---
app.use('/admin', (req, res, next) => {
	if (!REQUIRE_PROXY) return next();
	if (PROXY_SECRET && req.get('x-isidore-proxy') === PROXY_SECRET) return next();
	return res.status(403).send('This admin backend is only reachable through isidore.work/admin.');
});

// --------------------------------------------------------------- helpers ----

const signature = () => {
	const payload = {
		projects: db.prepare('SELECT * FROM projects ORDER BY id').all(),
		assets: db.prepare('SELECT * FROM assets ORDER BY id').all(),
		domains: listDomains(),
		roles: listRoles(),
		education: listEducation(),
		roles_map: db.prepare('SELECT * FROM project_roles ORDER BY project_slug').all(),
		settings: allSettings(),
	};
	return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
};

const pendingChanges = () => signature() !== getSetting('published_signature', '');

const slugify = (s) =>
	String(s || '')
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 80);

const list = (value) =>
	String(value ?? '')
		.split('\n')
		.map((s) => s.trim())
		.filter(Boolean);

function uniqueSlug(base, ignoreId = null) {
	let slug = slugify(base) || `project-${Date.now()}`;
	let n = 1;
	for (;;) {
		const row = projectBySlug(slug);
		if (!row || row.id === ignoreId) return slug;
		slug = `${slugify(base)}-${++n}`;
	}
}

const mediaUrl = (id) => `/admin/media/${id}`;

// --------------------------------------------------------------- auth ------

function currentSession(req) {
	const cookie = req.headers.cookie || '';
	const match = cookie.match(/(?:^|;\s*)isidore_admin=([^;]+)/);
	return match ? readSession(decodeURIComponent(match[1])) : null;
}

const PUBLIC_PATHS = new Set(['/login']);

app.use('/admin', (req, res, next) => {
	if (PUBLIC_PATHS.has(req.path)) return next();
	const session = currentSession(req);
	if (!session) {
		if (req.method === 'GET') return res.redirect('/admin/login');
		return res.status(401).send('not signed in');
	}
	req.adminSession = session;
	req.adminCookie = req.headers.cookie.match(/(?:^|;\s*)isidore_admin=([^;]+)/)[1];
	req.csrf = csrfFor(req.adminCookie);
	next();
});

app.get('/admin/login', (req, res) => {
	if (!authExists()) {
		return res
			.status(500)
			.send('No admin password is set yet. Run: cd ~/projects/isidore-work/admin && npm run set-password');
	}
	res.type('html').send(loginPage({ csrf: csrfFor('login'), notice: req.query.signedout ? 'Signed out.' : '' }));
});

app.post('/admin/login', (req, res) => {
	const ip = req.ip || 'unknown';
	const wait = lockoutRemaining(ip);
	if (wait > 0) {
		audit('login.locked', ip);
		return res
			.status(429)
			.type('html')
			.send(loginPage({ csrf: csrfFor('login'), error: `Too many attempts. Try again in ${Math.ceil(wait / 60)} minute(s).` }));
	}
	if (!checkCsrf(req, 'login')) {
		return res.status(400).type('html').send(loginPage({ csrf: csrfFor('login'), error: 'Bad request token — reload and try again.' }));
	}
	if (!verifyPassword(String(req.body.password || ''))) {
		recordAttempt(ip, false);
		audit('login.failed', ip);
		return res.status(401).type('html').send(loginPage({ csrf: csrfFor('login'), error: 'Wrong password.' }));
	}
	recordAttempt(ip, true);
	clearAttempts(ip);
	audit('login.ok', ip);
	const session = issueSession();
	res.setHeader('Set-Cookie', cookieHeader(session.value));
	res.redirect('/admin/');
});

app.post('/admin/logout', (req, res) => {
	res.setHeader('Set-Cookie', cookieHeader('', { clear: true }));
	res.redirect('/admin/login?signedout=1');
});

// -------------------------------------------------------------- context ----

const context = (req, extra = {}) => ({
	csrf: req.csrf,
	flash: req.query.ok ? { kind: 'ok', text: String(req.query.ok) } : req.query.err ? { kind: 'bad', text: String(req.query.err) } : null,
	pending: pendingChanges(),
	...extra,
});

const withProjectUrls = (p) => {
	if (!p) return p;
	const out = { ...p };
	if (p.cover && String(p.cover).startsWith('media:')) out.cover_url = mediaUrl(Number(String(p.cover).slice(6)));
	else if (p.cover) out.cover_url = p.cover;
	if (p.assetRows) out.assetRows = p.assetRows;
	return out;
};

// ------------------------------------------------------------ dashboard ----

// /admin with no trailing slash reaches the Worker too (the rest param matches an
// empty path), so render the dashboard rather than bouncing the browser.
app.get('/admin', (req, res) => {
	res.type('html').send(overview(context(req, { lastPublish: lastPublishLog(60) })));
});

app.get('/admin/', (req, res) => {
	res.type('html').send(overview(context(req, { lastPublish: lastPublishLog(60) })));
});

// --------------------------------------------------------------- landing ----

app.get('/admin/landing', (req, res) => {
	res.type('html').send(landing(context(req, { s: allSettings() })));
});

app.post('/admin/landing', upload.single('selfie_file'), (req, res) => {
	if (!checkCsrf(req, req.adminCookie)) return res.redirect('/admin/landing?err=' + encodeURIComponent('Bad request token'));
	const s = allSettings();
	const text = (k) => String(req.body[k] ?? s[k] ?? '');
	setSetting('site_title', text('site_title'));
	setSetting('site_description', text('site_description'));
	setSetting('landing_name', text('landing_name'));
	setSetting('landing_selfie_caption', text('landing_selfie_caption'));
	setSetting('landing_bio', list(req.body.landing_bio));
	setSetting('work_heading', text('work_heading'));
	setSetting('work_blurb', text('work_blurb'));
	setSetting('more_heading', text('more_heading'));
	setSetting('more_blurb', text('more_blurb'));
	setSetting('contact_heading', text('contact_heading'));
	setSetting('contact_blurb', text('contact_blurb'));

	const typed = String(req.body.landing_selfie || '').trim();
	if (req.file) {
		const media = storeMedia(req.file.buffer, req.file.originalname, req.file.mimetype);
		setSetting('landing_selfie', `media:${media.id}`);
	} else if (typed) {
		setSetting('landing_selfie', typed);
	}
	audit('landing.save', '');
	res.redirect('/admin/landing?ok=' + encodeURIComponent('Landing page saved.'));
});

// -------------------------------------------------------------- projects ----

app.get('/admin/projects', (req, res) => {
	const q = String(req.query.q || '').trim().toLowerCase();
	let rows = listProjects();
	if (q) {
		rows = rows.filter((p) =>
			[p.name, p.slug, p.summary, p.tags, p.domain_slug, p.category].join(' ').toLowerCase().includes(q),
		);
	}
	res.type('html').send(projectsPage(context(req, { rows, domains: listDomains(), q })));
});

app.get('/admin/projects/new', (req, res) => {
	const blank = {
		id: 0,
		slug: '',
		name: '',
		date: new Date().toISOString().slice(0, 10),
		domain_slug: '',
		category: 'Personal',
		audience: '',
		effort: '',
		time_hours: '',
		summary: '',
		body: '',
		cover: '',
		accent_color: '',
		tags: '[]',
		course: '',
		term: '',
		org: '',
		kind: '',
		status: '',
		deliverables: '[]',
		tools: '[]',
		redirect_from: '',
		featured: 0,
		visible: 1,
		role_id: '',
	};
	res.type('html').send(
		projectForm(context(req, { p: blank, assets: [], domains: listDomains(), roles: listRoles(), isNew: true })),
	);
});

app.get('/admin/projects/:id', (req, res) => {
	const p = getProject(Number(req.params.id));
	if (!p) return res.status(404).send('no such project');
	p.role_id = roleIdForProject(p.slug);
	res.type('html').send(
		projectForm(
			context(req, {
				p: withProjectUrls(p),
				assets: assetsFor(p.id),
				domains: listDomains(),
				roles: listRoles(),
				isNew: false,
			}),
		),
	);
});

function saveProject(req, existing) {
	const body = req.body;
	const id = existing ? existing.id : null;
	const name = String(body.name || '').trim() || 'Untitled project';
	const slug = uniqueSlug(body.slug || name, id);
	const ts = now();
	const fields = {
		slug,
		name,
		date: String(body.date || '').trim(),
		domain_slug: String(body.domain_slug || '').trim(),
		category: String(body.category || 'Personal').trim(),
		audience: String(body.audience || '').trim(),
		effort: String(body.effort || '').trim(),
		time_hours: String(body.time_hours || '').trim(),
		summary: String(body.summary || '').trim(),
		body: String(body.body || '').trim(),
		accent_color: String(body.accent_color || '').trim(),
		tags: JSON.stringify(list(body.tags)),
		course: String(body.course || '').trim(),
		term: String(body.term || '').trim(),
		org: String(body.org || '').trim(),
		kind: String(body.kind || '').trim(),
		status: String(body.status || '').trim(),
		deliverables: JSON.stringify(list(body.deliverables)),
		tools: JSON.stringify(list(body.tools)),
		redirect_from: String(body.redirect_from || '').trim(),
		featured: body.featured ? 1 : 0,
		visible: body.visible ? 1 : 0,
		updated_at: ts,
	};

	// cover: upload wins, then an explicit removal, then a typed value, else keep
	let cover = existing ? existing.cover : '';
	if (body.cover_delete) cover = '';
	if (req.files?.cover_file?.[0]) {
		const m = storeMedia(req.files.cover_file[0].buffer, req.files.cover_file[0].originalname, req.files.cover_file[0].mimetype);
		cover = `media:${m.id}`;
	} else if (String(body.cover || '').trim()) {
		cover = String(body.cover).trim();
	}
	fields.cover = cover;

	if (existing) {
		const sets = Object.keys(fields).map((k) => `${k} = ?`).join(', ');
		db.prepare(`UPDATE projects SET ${sets} WHERE id = ?`).run(...Object.values(fields), id);
	} else {
		const keys = [...Object.keys(fields), 'created_at'];
		db.prepare(
			`INSERT INTO projects (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
		).run(...Object.values(fields), ts);
	}
	const row = projectBySlug(slug);

	// ---- assets -------------------------------------------------------------
	const order = String(body.asset_order || '')
		.split(',')
		.map((s) => Number(s))
		.filter((n) => Number.isFinite(n) && n > 0);

	for (const a of assetsFor(row.id)) {
		if (body[`asset_delete_${a.id}`]) {
			db.prepare('DELETE FROM assets WHERE id = ?').run(a.id);
			continue;
		}
		const type = String(body[`asset_type_${a.id}`] || a.type);
		const caption = String(body[`asset_caption_${a.id}`] ?? a.caption);
		db.prepare('UPDATE assets SET type = ?, caption = ? WHERE id = ?').run(type, caption, a.id);
	}
	order.forEach((assetId, index) => {
		db.prepare('UPDATE assets SET sort_order = ? WHERE id = ? AND project_id = ?').run(index, assetId, row.id);
	});

	let nextOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM assets WHERE project_id = ?').get(row.id).n;
	for (const file of req.files?.new_files || []) {
		const media = storeMedia(file.buffer, file.originalname, file.mimetype);
		db.prepare(
			'INSERT INTO assets (project_id, type, media_id, src, caption, thumb, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
		).run(row.id, String(body.new_type || 'image'), media.id, `media:${media.id}`, String(body.new_caption || ''), '', nextOrder++);
	}
	const typedSrc = String(body.new_src || '').trim();
	if (typedSrc) {
		db.prepare(
			'INSERT INTO assets (project_id, type, media_id, src, caption, thumb, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
		).run(row.id, String(body.new_type || 'image'), null, typedSrc, String(body.new_caption || ''), '', nextOrder++);
	}

	// ---- CV role anchor -----------------------------------------------------
	const roleId = String(body.role_id || '').trim();
	if (roleId) {
		db.prepare(
			'INSERT INTO project_roles (project_slug, role_id) VALUES (?, ?) ON CONFLICT(project_slug) DO UPDATE SET role_id = excluded.role_id',
		).run(slug, roleId);
	} else {
		db.prepare('DELETE FROM project_roles WHERE project_slug = ?').run(slug);
	}

	// A renamed slug must not leave a dangling anchor.
	if (existing && existing.slug !== slug) {
		db.prepare('DELETE FROM project_roles WHERE project_slug = ?').run(existing.slug);
	}
	return row;
}

app.post('/admin/projects/new', upload.fields([{ name: 'cover_file', maxCount: 1 }, { name: 'new_files', maxCount: 20 }]), (req, res) => {
	if (!checkCsrf(req, req.adminCookie)) return res.redirect('/admin/projects?err=' + encodeURIComponent('Bad request token'));
	const row = saveProject(req, null);
	audit('project.create', row.slug);
	res.redirect(`/admin/projects/${row.id}?ok=` + encodeURIComponent('Project created.'));
});

app.post('/admin/projects/:id', upload.fields([{ name: 'cover_file', maxCount: 1 }, { name: 'new_files', maxCount: 20 }]), (req, res) => {
	if (!checkCsrf(req, req.adminCookie)) return res.redirect('/admin/projects?err=' + encodeURIComponent('Bad request token'));
	const existing = getProject(Number(req.params.id));
	if (!existing) return res.status(404).send('no such project');
	const row = saveProject(req, existing);
	audit('project.save', row.slug);
	res.redirect(`/admin/projects/${row.id}?ok=` + encodeURIComponent('Saved. Publish to make it live.'));
});

app.post('/admin/projects/:id/delete', (req, res) => {
	if (!checkCsrf(req, req.adminCookie)) return res.redirect('/admin/projects?err=' + encodeURIComponent('Bad request token'));
	const p = getProject(Number(req.params.id));
	if (!p) return res.status(404).send('no such project');
	db.prepare('DELETE FROM assets WHERE project_id = ?').run(p.id);
	db.prepare('DELETE FROM projects WHERE id = ?').run(p.id);
	db.prepare('DELETE FROM project_roles WHERE project_slug = ?').run(p.slug);
	audit('project.delete', p.slug);
	res.redirect('/admin/projects?ok=' + encodeURIComponent(`Deleted ${p.slug}.`));
});

// --------------------------------------------------------------- domains ----

app.get('/admin/domains', (req, res) => {
	res.type('html').send(domainsPage(context(req, { domains: listDomains() })));
});

app.post('/admin/domains', (req, res) => {
	if (!checkCsrf(req, req.adminCookie)) return res.redirect('/admin/domains?err=' + encodeURIComponent('Bad request token'));
	for (const d of listDomains()) {
		db.prepare('UPDATE domains SET label = ?, blurb = ?, color = ? WHERE slug = ?').run(
			String(req.body[`label_${d.slug}`] ?? d.label),
			String(req.body[`blurb_${d.slug}`] ?? d.blurb),
			String(req.body[`color_${d.slug}`] ?? d.color),
			d.slug,
		);
	}
	const slug = slugify(req.body.new_slug || req.body.new_label || '');
	if (slug && !db.prepare('SELECT 1 FROM domains WHERE slug = ?').get(slug)) {
		const max = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM domains').get().n;
		db.prepare('INSERT INTO domains (slug, label, blurb, color, sort_order) VALUES (?, ?, ?, ?, ?)').run(
			slug,
			String(req.body.new_label || slug),
			String(req.body.new_blurb || ''),
			String(req.body.new_color || '#2563eb'),
			max,
		);
		audit('domain.create', slug);
	}
	audit('domain.save', 'all');
	res.redirect('/admin/domains?ok=' + encodeURIComponent('Domains saved.'));
});

// -------------------------------------------------------------------- CV ----

app.get('/admin/cv', (req, res) => {
	res.type('html').send(cvPage(context(req, { roles: listRoles(), education: listEducation() })));
});

app.post('/admin/cv', (req, res) => {
	if (!checkCsrf(req, req.adminCookie)) return res.redirect('/admin/cv?err=' + encodeURIComponent('Bad request token'));
	const b = req.body;

	if (b.delete_role) {
		db.prepare('DELETE FROM roles WHERE id = ?').run(String(b.delete_role));
		db.prepare('DELETE FROM project_roles WHERE role_id = ?').run(String(b.delete_role));
		audit('role.delete', String(b.delete_role));
		return res.redirect('/admin/cv?ok=' + encodeURIComponent('CV record deleted.'));
	}
	if (b.delete_edu) {
		db.prepare('DELETE FROM education WHERE id = ?').run(Number(b.delete_edu));
		audit('education.delete', String(b.delete_edu));
		return res.redirect('/admin/cv?ok=' + encodeURIComponent('Education entry deleted.'));
	}

	for (const r of listRoles()) {
		db.prepare(
			`UPDATE roles SET title = ?, org = ?, location = ?, kind = ?, start = ?, end = ?, current = ?,
			 employment = ?, summary = ?, achievements = ?, skills = ?, tools = ? WHERE id = ?`,
		).run(
			String(b[`title_${r.id}`] ?? r.title),
			String(b[`org_${r.id}`] ?? r.org),
			String(b[`location_${r.id}`] ?? r.location),
			String(b[`kind_${r.id}`] ?? r.kind),
			String(b[`start_${r.id}`] ?? r.start),
			String(b[`end_${r.id}`] ?? r.end),
			b[`current_${r.id}`] ? 1 : 0,
			String(b[`employment_${r.id}`] ?? r.employment),
			String(b[`summary_${r.id}`] ?? r.summary),
			JSON.stringify(list(b[`achievements_${r.id}`] ?? '')),
			JSON.stringify(list(b[`skills_${r.id}`] ?? '')),
			JSON.stringify(list(b[`tools_${r.id}`] ?? '')),
			r.id,
		);
	}
	for (const e of listEducation()) {
		db.prepare('UPDATE education SET institution = ?, from_text = ?, to_text = ?, current = ? WHERE id = ?').run(
			String(b[`edu_inst_${e.id}`] ?? e.institution),
			String(b[`edu_from_${e.id}`] ?? e.from_text),
			String(b[`edu_to_${e.id}`] ?? e.to_text),
			b[`edu_current_${e.id}`] ? 1 : 0,
			e.id,
		);
	}
	const newId = String(b.new_id || '').trim();
	if (newId && !db.prepare('SELECT 1 FROM roles WHERE id = ?').get(newId)) {
		const max = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM roles').get().n;
		db.prepare(
			`INSERT INTO roles (id, title, org, location, kind, start, end, current, employment, summary,
			 achievements, skills, tools, sort_order) VALUES (?, ?, ?, '', ?, '', '', 0, '', '', '[]', '[]', '[]', ?)`,
		).run(newId, String(b.new_title || ''), String(b.new_org || ''), String(b.new_kind || 'Role'), max);
		audit('role.create', newId);
	}
	if (String(b.new_edu || '').trim()) {
		const max = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM education').get().n;
		db.prepare('INSERT INTO education (institution, from_text, to_text, current, sort_order) VALUES (?, ?, ?, 0, ?)').run(
			String(b.new_edu).trim(),
			String(b.new_edu_from || ''),
			String(b.new_edu_to || ''),
			max,
		);
	}
	audit('cv.save', '');
	res.redirect('/admin/cv?ok=' + encodeURIComponent('CV saved.'));
});

// --------------------------------------------------------------- contact ----

app.get('/admin/contact', (req, res) => {
	res.type('html').send(contactPage(context(req, { s: allSettings() })));
});

app.post('/admin/contact', (req, res) => {
	if (!checkCsrf(req, req.adminCookie)) return res.redirect('/admin/contact?err=' + encodeURIComponent('Bad request token'));
	for (const k of ['email', 'email2', 'github_url', 'linkedin_url', 'instagram_url']) {
		setSetting(k, String(req.body[k] ?? ''));
	}
	setSetting('categories', list(req.body.categories));
	audit('contact.save', '');
	res.redirect('/admin/contact?ok=' + encodeURIComponent('Contact details saved.'));
});

// ----------------------------------------------------------------- media ----

app.get('/admin/media', (req, res) => {
	const rows = db.prepare('SELECT * FROM media ORDER BY id DESC').all();
	res.type('html').send(mediaPage(context(req, { rows })));
});

app.post('/admin/media/upload', upload.array('files', 20), (req, res) => {
	if (!checkCsrf(req, req.adminCookie)) return res.redirect('/admin/media?err=' + encodeURIComponent('Bad request token'));
	let n = 0;
	for (const file of req.files || []) {
		storeMedia(file.buffer, file.originalname, file.mimetype);
		n++;
	}
	audit('media.upload', `${n} file(s)`);
	res.redirect('/admin/media?ok=' + encodeURIComponent(`${n} file(s) uploaded.`));
});

app.get('/admin/media/:id', (req, res) => {
	const row = mediaById(Number(req.params.id));
	if (!row) return res.status(404).send('not found');
	const file = path.join(MEDIA_DIR, row.file);
	if (!fs.existsSync(file)) return res.status(410).send('file missing');
	res.type(row.mime || 'application/octet-stream');
	res.setHeader('Cache-Control', 'private, max-age=300');
	fs.createReadStream(file).pipe(res);
});

app.post('/admin/media/:id/delete', (req, res) => {
	if (!checkCsrf(req, req.adminCookie)) return res.redirect('/admin/media?err=' + encodeURIComponent('Bad request token'));
	const id = Number(req.params.id);
	const used =
		db.prepare('SELECT COUNT(*) AS n FROM assets WHERE media_id = ?').get(id).n +
		db.prepare('SELECT COUNT(*) AS n FROM projects WHERE cover = ?').get(`media:${id}`).n;
	if (used) return res.redirect('/admin/media?err=' + encodeURIComponent('That file is still referenced by a project.'));
	const row = mediaById(id);
	if (row) {
		try {
			fs.unlinkSync(path.join(MEDIA_DIR, row.file));
		} catch {
			/* already gone */
		}
		db.prepare('DELETE FROM media WHERE id = ?').run(id);
		audit('media.delete', row.file);
	}
	res.redirect('/admin/media?ok=' + encodeURIComponent('File deleted.'));
});

// --------------------------------------------------------------- publish ----

app.get('/admin/publish', (req, res) => {
	res.type('html').send(publishPage(context(req, { log: lastPublishLog(400), repoStatus: repoStatus() })));
});

app.post('/admin/publish', async (req, res) => {
	if (!checkCsrf(req, req.adminCookie)) return res.redirect('/admin/publish?err=' + encodeURIComponent('Bad request token'));
	try {
		const result = await runPublish({ trigger: 'admin portal', required: ['generate', 'build', 'deploy', 'push'] });
		setSetting('published_signature', signature());
		setSetting('published_at', now());
		audit('publish', result.ok ? 'ok' : `failed at ${result.failedStep}`);
		res.redirect(
			'/admin/publish?' +
				(result.ok
					? 'ok=' + encodeURIComponent('Published. isidore.work is updated.')
					: 'err=' + encodeURIComponent(`Publish failed at: ${result.failedStep} — see the log below.`)),
		);
	} catch (error) {
		audit('publish', `error: ${error.message}`);
		res.redirect('/admin/publish?err=' + encodeURIComponent(`Publish crashed: ${error.message}`));
	}
});

// -------------------------------------------------------------- activity ----

app.get('/admin/activity', (req, res) => {
	res.type('html').send(activityPage(context(req, { rows: recentAudit(80) })));
});

app.get('/admin/*', (req, res) => {
	res.status(404).type('html').send(layout({ title: 'Not found', body: '<p>No such admin page.</p>', csrf: req.csrf || '' }));
});

app.listen(PORT, HOST, () => {
	console.log(`isidore admin listening on http://${HOST}:${PORT}/admin/`);
	console.log(`content dir: ${CONTENT_DIR}`);
	console.log(`proxy guard: ${REQUIRE_PROXY ? 'on' : 'off'}`);
});
