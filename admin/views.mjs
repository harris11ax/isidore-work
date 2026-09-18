// Server-rendered HTML for the admin portal. No build step, no client framework
// beyond a sprinkle of inline JS for the colour pickers and asset reordering.
export const esc = (s) =>
	String(s ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');

const NAV = [
	['', 'Overview'],
	['landing', 'Landing page'],
	['projects', 'Projects'],
	['domains', 'Domains & colours'],
	['cv', 'CV'],
	['contact', 'Contact & social'],
	['media', 'Media'],
	['publish', 'Publish'],
	['activity', 'Activity'],
];

export function layout({ title, active = '', body, csrf = '', flash = null, user = null, pending = null }) {
	const flashHtml = flash
		? `<div class="flash flash-${esc(flash.kind || 'ok')}">${esc(flash.text)}</div>`
		: '';
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)} — isidore.work admin</title>
<style>${CSS}</style>
</head>
<body>
<header class="topbar">
	<a class="brand" href="/admin/">isidore.work <span>admin</span></a>
	${user ? `<form method="post" action="/admin/logout" class="inline"><input type="hidden" name="_csrf" value="${esc(csrf)}"><button class="link">Sign out</button></form>` : ''}
</header>
<div class="shell">
	<nav class="side">
		${NAV.map(([slug, label]) => {
			const href = slug ? `/admin/${slug}` : '/admin/';
			const isActive = slug === active;
			return `<a href="${href}"${isActive ? ' class="on"' : ''}>${esc(label)}${
				slug === 'publish' && pending ? ` <span class="dot" title="unpublished changes"></span>` : ''
			}</a>`;
		}).join('\n\t\t')}
	</nav>
	<main class="main">
		${flashHtml}
		<h1>${esc(title)}</h1>
		${body}
	</main>
</div>
<script>${JS}</script>
</body>
</html>`;
}

export function loginPage({ error = '', notice = '', csrf = '' }) {
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Sign in — isidore.work admin</title>
<style>${CSS}</style>
</head>
<body class="centered">
<form class="login" method="post" action="/admin/login">
	<h1>isidore.work</h1>
	<p class="sub">Content administration</p>
	${error ? `<div class="flash flash-bad">${esc(error)}</div>` : ''}
	${notice ? `<div class="flash flash-ok">${esc(notice)}</div>` : ''}
	<label>Password<input type="password" name="password" autocomplete="current-password" autofocus required></label>
	<input type="hidden" name="_csrf" value="${esc(csrf)}">
	<button class="primary" type="submit">Sign in</button>
</form>
</body>
</html>`;
}

// ------------------------------------------------------------------ pieces --

export const field = (name, label, value, { type = 'text', hint = '', placeholder = '', wide = false } = {}) =>
	`<label class="f${wide ? ' wide' : ''}"><span>${esc(label)}</span>
	<input type="${type}" name="${esc(name)}" value="${esc(value ?? '')}" placeholder="${esc(placeholder)}">
	${hint ? `<em>${esc(hint)}</em>` : ''}</label>`;

export const area = (name, label, value, { rows = 4, hint = '', wide = true } = {}) =>
	`<label class="f${wide ? ' wide' : ''}"><span>${esc(label)}</span>
	<textarea name="${esc(name)}" rows="${rows}">${esc(value ?? '')}</textarea>
	${hint ? `<em>${esc(hint)}</em>` : ''}</label>`;

export const select = (name, label, value, options, { hint = '' } = {}) =>
	`<label class="f"><span>${esc(label)}</span>
	<select name="${esc(name)}">
		${options
			.map((o) => {
				const [val, text] = Array.isArray(o) ? o : [o, o];
				return `<option value="${esc(val)}"${String(val) === String(value) ? ' selected' : ''}>${esc(text)}</option>`;
			})
			.join('')}
	</select>${hint ? `<em>${esc(hint)}</em>` : ''}</label>`;

export const check = (name, label, checked, value = '1') =>
	`<label class="cb"><input type="checkbox" name="${esc(name)}" value="${esc(value)}"${checked ? ' checked' : ''}><span>${esc(label)}</span></label>`;

export const colorField = (name, label, value) =>
	`<label class="f"><span>${esc(label)}</span><input type="color" name="${esc(name)}" value="${esc(value || '#2563eb')}"></label>`;

export const csrfInput = (csrf) => `<input type="hidden" name="_csrf" value="${esc(csrf)}">`;

export const mediaPreview = (url, caption = '') =>
	url
		? `<figure class="thumb"><img src="${esc(url)}" alt="${esc(caption)}">${
				caption ? `<figcaption>${esc(caption)}</figcaption>` : ''
			}</figure>`
		: `<p class="muted">No image.</p>`;

const CSS = `
:root{--bg:#f6f7f9;--card:#fff;--ink:#14171a;--muted:#6b7280;--line:#e3e6ea;--accent:#2563eb;--bad:#b91c1c;--good:#15803d}
@media (prefers-color-scheme:dark){:root{--bg:#0f1113;--card:#171a1d;--ink:#e8eaed;--muted:#9aa1a9;--line:#2a2f35;--accent:#60a5fa;--bad:#f87171;--good:#4ade80}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--accent)}
h1{font-size:22px;margin:0 0 18px}
h2{font-size:16px;margin:28px 0 10px;letter-spacing:.01em}
h3{font-size:14px;margin:18px 0 8px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
.topbar{display:flex;justify-content:space-between;align-items:center;padding:12px 20px;background:var(--card);border-bottom:1px solid var(--line)}
.brand{font-weight:600;text-decoration:none;color:var(--ink)}
.brand span{color:var(--muted);font-weight:400}
.shell{display:flex;align-items:flex-start;gap:24px;max-width:1180px;margin:0 auto;padding:24px 20px 80px}
.side{position:sticky;top:20px;flex:0 0 190px;display:flex;flex-direction:column;gap:2px}
.side a{padding:7px 10px;border-radius:8px;text-decoration:none;color:var(--ink)}
.side a:hover{background:var(--card)}
.side a.on{background:var(--accent);color:#fff}
.dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#f59e0b;vertical-align:middle}
.main{flex:1;min-width:0}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px;margin-bottom:18px}
.row{display:flex;flex-wrap:wrap;gap:14px}
.f{display:flex;flex-direction:column;gap:5px;flex:1 1 240px;min-width:0}
.f.wide{flex-basis:100%}
.f>span{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}
.f em{font-size:12px;color:var(--muted);font-style:normal}
input[type=text],input[type=password],input[type=number],input[type=url],select,textarea{
	font:inherit;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:8px 10px;width:100%}
textarea{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;resize:vertical}
input[type=color]{width:56px;height:36px;padding:2px;background:var(--bg);border:1px solid var(--line);border-radius:8px}
.cb{display:flex;align-items:center;gap:8px;font-size:14px}
button{font:inherit;cursor:pointer}
button.primary{background:var(--accent);color:#fff;border:0;border-radius:8px;padding:9px 16px;font-weight:600}
button.ghost{background:transparent;color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:8px 14px}
button.danger{background:transparent;color:var(--bad);border:1px solid var(--bad);border-radius:8px;padding:8px 14px}
button.link{background:none;border:0;color:var(--accent);padding:0}
.inline{display:inline}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}
tr.hidden td{opacity:.5}
.flash{border-radius:8px;padding:10px 14px;margin-bottom:16px;border:1px solid var(--line)}
.flash-ok{background:color-mix(in srgb,var(--good) 12%,transparent);border-color:var(--good)}
.flash-bad{background:color-mix(in srgb,var(--bad) 12%,transparent);border-color:var(--bad)}
.muted{color:var(--muted)}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px}
.actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:18px}
.thumbs{display:flex;flex-wrap:wrap;gap:12px}
figure.thumb{margin:0;width:150px;background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:8px}
figure.thumb img{width:100%;height:100px;object-fit:cover;border-radius:6px;display:block}
figure.thumb figcaption{font-size:11px;color:var(--muted);margin-top:6px;word-break:break-all}
.asset{display:flex;gap:12px;align-items:flex-start;border:1px solid var(--line);border-radius:10px;padding:12px;margin-bottom:10px;background:var(--bg)}
.asset .handle{color:var(--muted);cursor:grab;user-select:none;font-size:16px;line-height:1}
.asset .grow{flex:1;min-width:0}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
pre.log{background:#0b0d0f;color:#d6e2ea;border-radius:10px;padding:14px;overflow:auto;max-height:420px;font-size:12.5px;line-height:1.5}
.centered{display:grid;place-items:center;min-height:100vh}
.login{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:30px;width:330px;display:flex;flex-direction:column;gap:14px}
.login h1{margin:0}
.login .sub{margin:-8px 0 4px;color:var(--muted);font-size:13px}
.login label{display:flex;flex-direction:column;gap:5px;font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}
.badge{display:inline-block;font-size:11px;padding:2px 7px;border-radius:999px;border:1px solid var(--line);color:var(--muted)}
.pill{display:inline-block;font-size:11px;padding:2px 8px;border-radius:999px;color:#fff}
`;

const JS = `
document.querySelectorAll('form[data-confirm]').forEach((f) => {
	f.addEventListener('submit', (e) => {
		if (!confirm(f.dataset.confirm)) e.preventDefault();
	});
});
document.querySelectorAll('[data-slug-from]').forEach((input) => {
	const target = document.querySelector(input.dataset.slugFrom);
	if (!target) return;
	input.addEventListener('input', () => {
		if (target.dataset.touched === 'yes') return;
		target.value = input.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
	});
	target.addEventListener('input', () => { target.dataset.touched = 'yes'; });
});
// drag-free asset reordering: move up / down buttons handle ordering
document.querySelectorAll('[data-move]').forEach((btn) => {
	btn.addEventListener('click', () => {
		const dir = btn.dataset.move === 'up' ? -1 : 1;
		const item = btn.closest('.asset');
		const list = item.parentElement;
		const items = [...list.querySelectorAll('.asset')];
		const i = items.indexOf(item);
		const j = i + dir;
		if (j < 0 || j >= items.length) return;
		if (dir === -1) list.insertBefore(item, items[j]);
		else list.insertBefore(items[j], item);
	});
});
// Record the on-screen asset order into asset_order just before the form posts,
// so the ↑ ↓ buttons actually persist.
document.querySelectorAll('form').forEach((form) => {
	const hidden = form.querySelector('#asset_order');
	if (!hidden) return;
	form.addEventListener('submit', () => {
		const ids = [...form.querySelectorAll('#assets .asset input[name="asset_id"]')]
			.filter((el) => !el.closest('.asset').querySelector('input[type=checkbox][name^="asset_delete_"]:checked'))
			.map((el) => el.value);
		hidden.value = ids.join(',');
	});
});
`;
