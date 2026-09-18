// Content database for isidore.work — the single source of truth for everything
// the site renders. Lives on izzyserver, outside the git checkout:
//
//   /home/izzy/isidore-content/          (ISIDORE_CONTENT_DIR)
//     content.db                         this database
//     media/                             every uploaded image/PDF, by sha256 name
//     auth.json                          admin password hash + session key
//     publish.env                        Cloudflare deploy credentials (0600)
//     publish.log                        append-only record of every publish
//
// The repo keeps a snapshot: each publish writes the database back out into
// src/data/* (see generate.mjs) and copies the media it references into
// public/projects/<slug>/, which is what gets committed and pushed to the
// GitHub backup.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const REPO = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
export const CONTENT_DIR = process.env.ISIDORE_CONTENT_DIR || '/home/izzy/isidore-content';
export const MEDIA_DIR = path.join(CONTENT_DIR, 'media');
export const DB_PATH = path.join(CONTENT_DIR, 'content.db');

fs.mkdirSync(MEDIA_DIR, { recursive: true });

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL          -- JSON
);

CREATE TABLE IF NOT EXISTS domains (
  slug       TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  blurb      TEXT NOT NULL DEFAULT '',
  color      TEXT NOT NULL DEFAULT '#2563eb',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS projects (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  slug         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  date         TEXT NOT NULL DEFAULT '',
  domain_slug  TEXT NOT NULL DEFAULT '',
  category     TEXT NOT NULL DEFAULT 'Personal',
  audience     TEXT NOT NULL DEFAULT '',
  effort       TEXT NOT NULL DEFAULT '',
  time_hours   TEXT NOT NULL DEFAULT '',
  summary      TEXT NOT NULL DEFAULT '',
  body         TEXT NOT NULL DEFAULT '',      -- long description, markdown-ish
  cover        TEXT NOT NULL DEFAULT '',      -- card-only cover image url
  accent_color TEXT NOT NULL DEFAULT '',      -- '' = inherit the domain colour
  tags         TEXT NOT NULL DEFAULT '[]',    -- JSON array
  course       TEXT NOT NULL DEFAULT '',
  term         TEXT NOT NULL DEFAULT '',
  org          TEXT NOT NULL DEFAULT '',
  kind         TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT '',
  deliverables TEXT NOT NULL DEFAULT '[]',
  tools        TEXT NOT NULL DEFAULT '[]',
  redirect_from TEXT NOT NULL DEFAULT '',
  featured     INTEGER NOT NULL DEFAULT 0,
  visible      INTEGER NOT NULL DEFAULT 1,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type       TEXT NOT NULL DEFAULT 'image',   -- image | pdf | video | embed
  media_id   INTEGER REFERENCES media(id),
  src        TEXT NOT NULL DEFAULT '',        -- url, or /projects/<slug>/<file>
  caption    TEXT NOT NULL DEFAULT '',
  thumb      TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS media (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  file       TEXT NOT NULL UNIQUE,            -- name inside media/
  orig_name  TEXT NOT NULL DEFAULT '',
  mime       TEXT NOT NULL DEFAULT '',
  bytes      INTEGER NOT NULL DEFAULT 0,
  sha256     TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

-- One CV spine record per role/award/credential/volunteer entry.
CREATE TABLE IF NOT EXISTS roles (
  id           TEXT PRIMARY KEY,              -- R01, A02, C01 ...
  title        TEXT NOT NULL DEFAULT '',
  org          TEXT NOT NULL DEFAULT '',
  location     TEXT NOT NULL DEFAULT '',
  kind         TEXT NOT NULL DEFAULT 'Role',  -- Role | Fellowship | Volunteer | Award | Credential
  start        TEXT NOT NULL DEFAULT '',
  end          TEXT NOT NULL DEFAULT '',
  current      INTEGER NOT NULL DEFAULT 0,
  employment   TEXT NOT NULL DEFAULT '',
  summary      TEXT NOT NULL DEFAULT '',
  achievements TEXT NOT NULL DEFAULT '[]',
  skills       TEXT NOT NULL DEFAULT '[]',
  tools        TEXT NOT NULL DEFAULT '[]',
  sort_order   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS education (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  institution TEXT NOT NULL,
  from_text   TEXT NOT NULL DEFAULT '',
  to_text     TEXT NOT NULL DEFAULT '',
  current     INTEGER NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

-- Which CV role a Work-category project came out of (was ROLE_BY_SLUG).
CREATE TABLE IF NOT EXISTS project_roles (
  project_slug TEXT PRIMARY KEY,
  role_id      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  at TEXT NOT NULL,
  ok INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_assets_project ON assets(project_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_login_at ON login_attempts(at);
`;

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec(SCHEMA);

export const now = () => new Date().toISOString();

// ---------------------------------------------------------------- settings --

export function getSetting(key, fallback = null) {
	const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
	if (!row) return fallback;
	try {
		return JSON.parse(row.value);
	} catch {
		return fallback;
	}
}

export function setSetting(key, value) {
	db.prepare(
		'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
	).run(key, JSON.stringify(value));
}

export function allSettings() {
	const out = {};
	for (const row of db.prepare('SELECT key, value FROM settings').all()) {
		try {
			out[row.key] = JSON.parse(row.value);
		} catch {
			out[row.key] = null;
		}
	}
	return out;
}

export function audit(action, detail = '') {
	db.prepare('INSERT INTO audit (at, action, detail) VALUES (?, ?, ?)').run(now(), action, String(detail));
}

// ------------------------------------------------------------------- media --

/**
 * Store an upload, preserving the original filename so published URLs stay stable
 * across re-imports and publishes (the site's asset URLs are part of the repo's
 * history — renaming them churns the whole diff and orphans files).
 *
 * Re-uploading the same file under the same name reuses the existing row; a name
 * clash with different content gets a short hash suffix. Filenames and extensions
 * keep their case, because the published copies live on a case-sensitive server.
 */
export function storeMedia(buffer, origName, mime) {
	const sha = crypto.createHash('sha256').update(buffer).digest('hex');

	const parsed = path.parse(String(origName || ''));
	const stem = (parsed.name || 'file').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 90) || 'file';
	const ext = (parsed.ext || '').slice(0, 12);

	let file = `${stem}${ext}`;
	const existing = db.prepare('SELECT * FROM media WHERE file = ?').get(file);
	if (existing) {
		if (existing.sha256 === sha) {
			const dest = path.join(MEDIA_DIR, existing.file);
			if (!fs.existsSync(dest)) fs.writeFileSync(dest, buffer);
			return existing;
		}
		file = `${stem}-${sha.slice(0, 8)}${ext}`;
		const clash = db.prepare('SELECT * FROM media WHERE file = ?').get(file);
		if (clash) {
			const dest = path.join(MEDIA_DIR, clash.file);
			if (!fs.existsSync(dest)) fs.writeFileSync(dest, buffer);
			return clash;
		}
	}

	fs.writeFileSync(path.join(MEDIA_DIR, file), buffer);
	db.prepare(
		'INSERT INTO media (file, orig_name, mime, bytes, sha256, created_at) VALUES (?, ?, ?, ?, ?, ?)',
	).run(file, origName || file, mime || '', buffer.length, sha, now());
	return db.prepare('SELECT * FROM media WHERE file = ?').get(file);
}

export function mediaById(id) {
	return db.prepare('SELECT * FROM media WHERE id = ?').get(id);
}

// ------------------------------------------------------------------ projects --

export function listProjects({ includeHidden = true } = {}) {
	const sql = `SELECT * FROM projects ${includeHidden ? '' : 'WHERE visible = 1'} ORDER BY sort_order, date DESC, id DESC`;
	return db.prepare(sql).all();
}

export function getProject(id) {
	return db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
}

export function projectBySlug(slug) {
	return db.prepare('SELECT * FROM projects WHERE slug = ?').get(slug);
}

export function assetsFor(projectId) {
	return db.prepare('SELECT * FROM assets WHERE project_id = ? ORDER BY sort_order, id').all(projectId);
}

export function roleIdForProject(slug) {
	const row = db.prepare('SELECT role_id FROM project_roles WHERE project_slug = ?').get(slug);
	return row ? row.role_id : '';
}

export function listDomains() {
	return db.prepare('SELECT * FROM domains ORDER BY sort_order, label').all();
}

export function listRoles() {
	return db.prepare('SELECT * FROM roles ORDER BY sort_order, id').all();
}

export function listEducation() {
	return db.prepare('SELECT * FROM education ORDER BY sort_order, id').all();
}

export function recentAudit(limit = 40) {
	return db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT ?').all(limit);
}

export const j = (v) => JSON.stringify(v ?? null);
export const pj = (v, fallback) => {
	try {
		return JSON.parse(v);
	} catch {
		return fallback;
	}
};
