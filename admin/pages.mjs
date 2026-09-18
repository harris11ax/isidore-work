// The admin portal's screens.
import { esc, layout, field, area, select, check, colorField, csrfInput, mediaPreview } from './views.mjs';
import { db, listDomains, listRoles, listEducation, allSettings, recentAudit, assetsFor, mediaById } from './db.mjs';

const lines = (v) => String(v ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
const asLines = (json) => {
	try {
		return JSON.parse(json).join('\n');
	} catch {
		return '';
	}
};

export function overview({ csrf, flash, pending, lastPublish }) {
	const projectCount = db.prepare('SELECT COUNT(*) AS n FROM projects').get().n;
	const hidden = db.prepare('SELECT COUNT(*) AS n FROM projects WHERE visible = 0').get().n;
	const assetCount = db.prepare('SELECT COUNT(*) AS n FROM assets').get().n;
	const mediaCount = db.prepare('SELECT COUNT(*) AS n FROM media').get().n;
	const roleCount = db.prepare('SELECT COUNT(*) AS n FROM roles').get().n;

	const body = `
	<div class="card">
		<div class="row">
			<div class="f"><span>Projects</span><strong>${projectCount}</strong>
				<em>${hidden ? `${hidden} hidden` : 'all visible'}</em></div>
			<div class="f"><span>Assets</span><strong>${assetCount}</strong><em>across all projects</em></div>
			<div class="f"><span>Media files</span><strong>${mediaCount}</strong><em>on izzyserver</em></div>
			<div class="f"><span>CV records</span><strong>${roleCount}</strong><em>roles, awards, credentials</em></div>
		</div>
	</div>
	${
		pending
			? `<div class="flash flash-ok">There are edits that have not been published yet.
				<a href="/admin/publish">Publish now</a>.</div>`
			: `<div class="card"><p>Everything is published. Content lives in
				<span class="mono">content.db</span> on izzyserver; publishing writes the site data,
				rebuilds, deploys the Cloudflare Worker and pushes the backup repo.</p></div>`
	}
	<div class="card">
		<h2>Last publish</h2>
		${lastPublish ? `<pre class="log">${esc(lastPublish)}</pre>` : '<p class="muted">Nothing published from this portal yet.</p>'}
	</div>`;
	return layout({ title: 'Overview', active: '', body, csrf, flash, pending });
}

export function landing({ csrf, flash, s, pending }) {
	const bio = Array.isArray(s.landing_bio) ? s.landing_bio.join('\n') : '';
	const body = `
	<form method="post" action="/admin/landing" enctype="multipart/form-data">
		${csrfInput(csrf)}
		<div class="card">
			<h2>Page title &amp; description</h2>
			<div class="row">
				${field('site_title', 'Browser / site title', s.site_title)}
				${field('site_description', 'Meta description', s.site_description)}
			</div>
		</div>

		<div class="card">
			<h2>Hero</h2>
			<div class="row">
				${field('landing_name', 'Name (h1)', s.landing_name)}
				${field('landing_selfie_caption', 'Photo caption', s.landing_selfie_caption)}
			</div>
			<div class="row">${mediaPreview(s.landing_selfie, 'current photo')}</div>
			<div class="row">
				<label class="f"><span>Replace photo</span><input type="file" name="selfie_file" accept="image/*"></label>
				${field('landing_selfie', 'or image path / URL', String(s.landing_selfie || '').startsWith('media:') ? '' : s.landing_selfie, {
					hint: 'leave blank when uploading a file; an external https:// URL also works',
				})}
			</div>
			${area('landing_bio', 'Bio — one paragraph per line (HTML allowed)', bio, { rows: 6 })}
		</div>

		<div class="card">
			<h2>Section headings</h2>
			<div class="row">
				${field('work_heading', 'Professional work heading', s.work_heading)}
				${field('more_heading', 'Everything-else heading', s.more_heading)}
				${field('contact_heading', 'Contact heading', s.contact_heading)}
			</div>
			${area('work_blurb', 'Professional work blurb', s.work_blurb, {
				rows: 3,
				hint: 'use {count} for the number of Work records',
			})}
			${area('more_blurb', 'Everything-else blurb', s.more_blurb, { rows: 3, hint: 'use {count} for the remaining records' })}
			${area('contact_blurb', 'Contact blurb', s.contact_blurb, { rows: 3 })}
		</div>

		<div class="actions"><button class="primary" type="submit">Save landing page</button></div>
	</form>`;
	return layout({ title: 'Landing page', active: 'landing', body, csrf, flash, pending });
}

export function projects({ csrf, flash, rows, domains, q, pending }) {
	const domainLabel = Object.fromEntries(domains.map((d) => [d.slug, d.label]));
	const body = `
	<div class="card">
		<form method="get" action="/admin/projects" class="row">
			<label class="f"><span>Search</span><input type="text" name="q" value="${esc(q || '')}" placeholder="title, slug, tag..."></label>
			<div class="f" style="justify-content:flex-end"><button class="ghost" type="submit">Filter</button></div>
		</form>
	</div>
	<div class="card">
		<table>
			<thead><tr><th>Title</th><th>Domain</th><th>Category</th><th>Date</th><th>Assets</th><th>State</th><th></th></tr></thead>
			<tbody>
			${rows
				.map((p) => {
					const n = db.prepare('SELECT COUNT(*) AS n FROM assets WHERE project_id = ?').get(p.id).n;
					return `<tr class="${p.visible ? '' : 'hidden'}">
						<td><a href="/admin/projects/${p.id}">${esc(p.name)}</a><br><span class="muted mono">${esc(p.slug)}</span></td>
						<td>${esc(domainLabel[p.domain_slug] || p.domain_slug || '—')}</td>
						<td>${esc(p.category)}</td>
						<td class="mono">${esc(p.date)}</td>
						<td>${n}</td>
						<td>${p.visible ? '' : '<span class="badge">hidden</span> '}${p.featured ? '<span class="badge">featured</span>' : ''}</td>
						<td><a href="/admin/projects/${p.id}">edit</a></td>
					</tr>`;
				})
				.join('\n')}
			</tbody>
		</table>
		${rows.length === 0 ? '<p class="muted">No projects match.</p>' : ''}
		<div class="actions">
			<a class="primary" href="/admin/projects/new" style="text-decoration:none;display:inline-block">Add a project</a>
			<span class="muted">${rows.length} shown</span>
		</div>
	</div>`;
	return layout({ title: 'Projects', active: 'projects', body, csrf, flash, pending });
}

export function projectForm({ csrf, flash, p, assets, domains, roles, pending, isNew }) {
	const assetRows = assets
		.map(
			(a) => `<div class="asset">
			<div class="handle">⋮⋮</div>
			<div class="grow">
				<div class="row">
					${select('asset_type_' + a.id, 'Type', a.type, ['image', 'pdf', 'video', 'embed'])}
					${field('asset_caption_' + a.id, 'Caption', a.caption)}
				</div>
				<p class="muted mono">${esc(a.src)}</p>
				<input type="hidden" name="asset_id" value="${a.id}">
			</div>
			<div style="display:flex;flex-direction:column;gap:6px">
				<button type="button" class="ghost" data-move="up">↑</button>
				<button type="button" class="ghost" data-move="down">↓</button>
			</div>
			${check('asset_delete_' + a.id, 'remove', false)}
		</div>`,
		)
		.join('\n');

	const domainOptions = [['', '— none —'], ...domains.map((d) => [d.slug, `${d.label} (${d.slug})`])];
	const roleOptions = [['', '— not professional work —'], ...roles.map((r) => [r.id, `${r.id} · ${r.title} — ${r.org}`])];
	const categories = (() => {
		try {
			return JSON.parse(allSettings().categories || '[]');
		} catch {
			return ['School', 'Work', 'Personal'];
		}
	})();

	const body = `
	<form method="post" action="/admin/projects/${isNew ? 'new' : p.id}" enctype="multipart/form-data">
		${csrfInput(csrf)}
		<div class="card">
			<h2>${isNew ? 'New project' : 'Edit project'}</h2>
			<div class="row">
				${field('name', 'Title', p.name, { placeholder: 'Transmission line fault locator' })}
				${field('slug', 'URL slug', p.slug, { hint: 'becomes /projects/<slug>/ — changing it retires the old URL', placeholder: 'transmission-line-fault-locator' })}
			</div>
			<div class="row">
				${select('domain_slug', 'Domain', p.domain_slug, domainOptions)}
				${select('category', 'Category', p.category, categories)}
				${field('date', 'Date', p.date, { hint: 'YYYY-MM-DD, drives ordering' })}
			</div>
			<div class="row">
				${field('audience', 'Audience', p.audience)}
				${field('effort', 'Effort', p.effort, { placeholder: 'High' })}
				${field('time_hours', 'Hours', p.time_hours, { placeholder: '60+' })}
			</div>
			${area('summary', 'Summary (the card blurb)', p.summary, { rows: 3 })}
			${area('body', 'Long description (detail page, markdown-ish)', p.body, {
				rows: 8,
				hint: 'blank lines split paragraphs; **bold**, *italic*, [link](url) and - lists work',
			})}
			<div class="row">
				${area('tags', 'Tags — one per line', asLines(p.tags), { rows: 4, wide: false })}
				${area('tools', 'Tools — one per line', asLines(p.tools), { rows: 4, wide: false })}
				${area('deliverables', 'Deliverables — one per line', asLines(p.deliverables), { rows: 4, wide: false })}
			</div>
			<div class="row">
				${field('course', 'Course', p.course)}
				${field('term', 'Term', p.term)}
				${field('org', 'Organisation', p.org)}
			</div>
			<div class="row">
				${field('kind', 'Kind', p.kind, { placeholder: 'Coursework / Personal / Volunteer' })}
				${field('status', 'Status', p.status, { placeholder: 'In progress' })}
				${select('role_id', 'CV role (anchors the homepage entry)', p.role_id || '', roleOptions)}
			</div>
			<div class="row">
				${field('redirect_from', 'Redirect an old URL from', p.redirect_from, { placeholder: '/old/path' })}
				${colorField('accent_color', 'Accent colour (blank = domain colour)', p.accent_color || '#2563eb')}
			</div>
			<div class="row">
				${check('visible', 'Visible on the site', Boolean(p.visible))}
				${check('featured', 'Feature this project', Boolean(p.featured))}
			</div>
		</div>

		<div class="card">
			<h2>Cover image</h2>
			<p class="muted">Card-only image; it is not repeated in the detail gallery.</p>
			<div class="row">${mediaPreview(p.cover_url, 'current cover')}</div>
			<div class="row">
				<label class="f"><span>Upload cover</span><input type="file" name="cover_file" accept="image/*"></label>
				${field('cover', 'or image path / URL', String(p.cover || '').startsWith('media:') ? '' : p.cover, { hint: 'blank clears it when combined with "remove cover"' })}
				${check('cover_delete', 'Remove cover', false)}
			</div>
		</div>

		<div class="card">
			<h2>Images &amp; files</h2>
			<p class="muted">One asset per gallery entry, in the order below (↑ ↓ to reorder, then save).</p>
			<div id="assets">
				${assetRows || '<p class="muted">No assets yet.</p>'}
			</div>
			<input type="hidden" name="asset_order" id="asset_order">
			<h3>Add</h3>
			<div class="row">
				<label class="f"><span>Upload file(s)</span><input type="file" name="new_files" accept="image/*,application/pdf,video/mp4" multiple></label>
				${field('new_src', 'or image path / URL', '', { hint: 'e.g. /projects/slug/photo.jpg' })}
				${field('new_caption', 'Caption', '')}
				${select('new_type', 'Type', 'image', ['image', 'pdf', 'video', 'embed'])}
			</div>
		</div>

		<div class="actions">
			<button class="primary" type="submit">Save project</button>
			<a class="ghost" href="/admin/projects" style="text-decoration:none">Cancel</a>
		</div>
	</form>
	${
		isNew
			? ''
			: `<form method="post" action="/admin/projects/${p.id}/delete" data-confirm="Delete this project permanently? Its media files stay in the library.">
			${csrfInput(csrf)}
			<div class="actions"><button class="danger" type="submit">Delete project</button>
			<span class="muted">or untick "Visible" above to hide it while keeping the record.</span></div>
		</form>`
	}`;
	return layout({ title: isNew ? 'New project' : p.name, active: 'projects', body, csrf, flash, pending });
}

export function domainsPage({ csrf, flash, domains, pending }) {
	const body = `
	<form method="post" action="/admin/domains">
		${csrfInput(csrf)}
		<div class="card">
			<p class="muted">Domains are the site's primary grouping and filter axis. The colour here is the
			accent every card, chip and border in that domain uses unless a project overrides it.</p>
			<table>
				<thead><tr><th>Slug</th><th>Label</th><th>Blurb</th><th>Colour</th></tr></thead>
				<tbody>
				${domains
					.map(
						(d) => `<tr>
					<td class="mono">${esc(d.slug)}</td>
					<td><input type="text" name="label_${esc(d.slug)}" value="${esc(d.label)}"></td>
					<td><input type="text" name="blurb_${esc(d.slug)}" value="${esc(d.blurb)}"></td>
					<td><input type="color" name="color_${esc(d.slug)}" value="${esc(d.color || '#2563eb')}"></td>
				</tr>`,
					)
					.join('')}
				</tbody>
			</table>
		</div>
		<div class="card">
			<h2>Add a domain</h2>
			<div class="row">
				${field('new_slug', 'Slug', '', { placeholder: 'photography' })}
				${field('new_label', 'Label', '', { placeholder: 'Photography' })}
				${field('new_blurb', 'Blurb', '')}
				${colorField('new_color', 'Colour', '#0891b2')}
			</div>
		</div>
		<div class="actions"><button class="primary" type="submit">Save domains</button></div>
	</form>`;
	return layout({ title: 'Domains & colours', active: 'domains', body, csrf, flash, pending });
}

export function cvPage({ csrf, flash, roles, education, pending }) {
	const kinds = ['Role', 'Fellowship', 'Volunteer', 'Award', 'Credential'];
	const roleCards = roles
		.map(
			(r) => `<div class="card">
			<h2>${esc(r.id)} · ${esc(r.title || 'untitled')}</h2>
			<div class="row">
				${field(`title_${r.id}`, 'Title', r.title)}
				${field(`org_${r.id}`, 'Organisation', r.org)}
				${field(`location_${r.id}`, 'Location', r.location)}
			</div>
			<div class="row">
				${select(`kind_${r.id}`, 'Kind', r.kind, kinds)}
				${field(`start_${r.id}`, 'Start', r.start, { hint: 'YYYY-MM' })}
				${field(`end_${r.id}`, 'End', r.end, { hint: '"present" or blank' })}
				${check(`current_${r.id}`, 'Current', Boolean(r.current))}
			</div>
			<div class="row">${field(`employment_${r.id}`, 'Employment', r.employment)}</div>
			${area(`summary_${r.id}`, 'Summary', r.summary, { rows: 2 })}
			<div class="row">
				${area(`achievements_${r.id}`, 'Achievements — one per line', asLines(r.achievements), { rows: 4, wide: false })}
				${area(`skills_${r.id}`, 'Skills — one per line', asLines(r.skills), { rows: 4, wide: false })}
				${area(`tools_${r.id}`, 'Tools — one per line', asLines(r.tools), { rows: 4, wide: false })}
			</div>
			<div class="actions">
				<button class="ghost" type="submit" name="delete_role" value="${esc(r.id)}" formnovalidate data-confirm="Delete ${esc(r.id)}?">Delete this record</button>
			</div>
		</div>`,
		)
		.join('\n');

	const eduCards = education
		.map(
			(e) => `<div class="asset">
			<div class="grow"><div class="row">
				${field(`edu_inst_${e.id}`, 'Institution', e.institution)}
				${field(`edu_from_${e.id}`, 'From', e.from_text)}
				${field(`edu_to_${e.id}`, 'To', e.to_text)}
				${check(`edu_current_${e.id}`, 'Current', Boolean(e.current))}
			</div></div>
			<button class="ghost" type="submit" name="delete_edu" value="${e.id}" formnovalidate data-confirm="Delete this entry?">Delete</button>
		</div>`,
		)
		.join('\n');

	const body = `
	<form method="post" action="/admin/cv">
		${csrfInput(csrf)}
		<p class="muted">The CV spine. Work-category projects anchor to these records by id, which is where
		the homepage's employer/role/dates come from.</p>
		${roleCards}
		<div class="card">
			<h2>Add a CV record</h2>
			<div class="row">
				${field('new_id', 'ID', '', { hint: 'R01, A03, C02 — projects anchor to this' })}
				${field('new_title', 'Title', '')}
				${field('new_org', 'Organisation', '')}
				${select('new_kind', 'Kind', 'Role', kinds)}
			</div>
		</div>
		<h2>Education</h2>
		<div class="card">${eduCards || '<p class="muted">Nothing yet.</p>'}
			<h3>Add</h3>
			<div class="row">${field('new_edu', 'Institution', '')}${field('new_edu_from', 'From', '')}${field('new_edu_to', 'To', '')}</div>
		</div>
		<div class="actions"><button class="primary" type="submit">Save CV</button></div>
	</form>`;
	return layout({ title: 'CV', active: 'cv', body, csrf, flash, pending });
}

export function contactPage({ csrf, flash, s, pending }) {
	const categories = (() => {
		try {
			return JSON.parse(s.categories || '[]').join('\n');
		} catch {
			return '';
		}
	})();
	const body = `
	<form method="post" action="/admin/contact">
		${csrfInput(csrf)}
		<div class="card">
			<h2>Contact &amp; social</h2>
			<div class="row">
				${field('email', 'Primary email', s.email)}
				${field('email2', 'Secondary email', s.email2)}
			</div>
			<div class="row">
				${field('github_url', 'GitHub', s.github_url)}
				${field('linkedin_url', 'LinkedIn', s.linkedin_url)}
				${field('instagram_url', 'Instagram', s.instagram_url)}
			</div>
		</div>
		<div class="card">
			<h2>Categories</h2>
			${area('categories', 'One per line — the secondary filter axis', categories, { rows: 4 })}
		</div>
		<div class="actions"><button class="primary" type="submit">Save</button></div>
	</form>`;
	return layout({ title: 'Contact & social', active: 'contact', body, csrf, flash, pending });
}

export function mediaPage({ csrf, flash, rows, pending }) {
	const body = `
	<div class="card">
		<p class="muted">Every file uploaded through this portal, stored on izzyserver. Files are de-duplicated
		by content hash, so uploading the same picture twice stores it once. Deleting here only works when
		nothing references the file.</p>
		<form method="post" action="/admin/media/upload" enctype="multipart/form-data">
			${csrfInput(csrf)}
			<div class="row">
				<label class="f"><span>Upload</span><input type="file" name="files" multiple></label>
				<div class="f" style="justify-content:flex-end"><button class="primary" type="submit">Upload</button></div>
			</div>
		</form>
	</div>
	<div class="card">
		<div class="thumbs">
			${rows
				.map((m) => {
					const used = db.prepare('SELECT COUNT(*) AS n FROM assets WHERE media_id = ?').get(m.id).n
						+ db.prepare("SELECT COUNT(*) AS n FROM projects WHERE cover = ?").get(`media:${m.id}`).n;
					const isImage = /^image\//.test(m.mime);
					return `<figure class="thumb">
						${isImage ? `<img src="/admin/media/${m.id}" alt="">` : `<div class="muted mono" style="height:100px">${esc(m.mime)}</div>`}
						<figcaption>${esc(m.orig_name)}<br>${Math.round(m.bytes / 1024)} KB · ${used ? `used ${used}×` : 'unused'}<br>
						<form method="post" action="/admin/media/${m.id}/delete" class="inline" data-confirm="Delete this file?">
							${csrfInput(csrf)}<button class="link">delete</button>
						</form></figcaption>
					</figure>`;
				})
				.join('\n')}
		</div>
		${rows.length === 0 ? '<p class="muted">No media yet.</p>' : ''}
	</div>`;
	return layout({ title: 'Media', active: 'media', body, csrf, flash, pending });
}

export function publishPage({ csrf, flash, log, repoStatus, pending }) {
	const body = `
	<div class="card">
		<h2>Publish</h2>
		<p>Publishing regenerates <span class="mono">src/data/*</span> from the content database, copies the
		media each record references into <span class="mono">public/</span>, builds the Astro site, deploys the
		Cloudflare Worker and pushes the commit to the GitHub backup repository.</p>
		<div class="row"><div class="f"><span>Repository</span><pre class="mono" style="white-space:pre-wrap;margin:0">${esc(repoStatus)}</pre></div></div>
		<form method="post" action="/admin/publish" data-confirm="Publish the current content to isidore.work?">
			${csrfInput(csrf)}
			<div class="actions"><button class="primary" type="submit">Publish now</button>
			<span class="muted">Takes about a minute; the page reloads when it is done.</span></div>
		</form>
	</div>
	<div class="card">
		<h2>Last publish output</h2>
		${log ? `<pre class="log">${esc(log)}</pre>` : '<p class="muted">No publishes yet.</p>'}
	</div>`;
	return layout({ title: 'Publish', active: 'publish', body, csrf, flash, pending });
}

export function activityPage({ csrf, flash, rows, pending }) {
	const body = `
	<div class="card">
		<table>
			<thead><tr><th>When</th><th>Action</th><th>Detail</th></tr></thead>
			<tbody>
			${rows
				.map(
					(r) =>
						`<tr><td class="mono">${esc(r.at)}</td><td>${esc(r.action)}</td><td class="mono">${esc(r.detail)}</td></tr>`,
				)
				.join('')}
			</tbody>
		</table>
		${rows.length === 0 ? '<p class="muted">Nothing recorded yet.</p>' : ''}
	</div>`;
	return layout({ title: 'Activity', active: 'activity', body, csrf, flash, pending });
}

export function mediaDetailUrl(id) {
	return `/admin/media/${id}`;
}

export { lines, asLines, mediaById };
