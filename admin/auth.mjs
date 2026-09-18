// Admin authentication: a single password, stored only as a scrypt hash, plus
// signed stateless session cookies and a failed-login throttle.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { CONTENT_DIR, db, now } from './db.mjs';

export const AUTH_FILE = path.join(CONTENT_DIR, 'auth.json');
export const COOKIE_NAME = 'isidore_admin';
const SESSION_DAYS = 30;
const MAX_ATTEMPTS = 8;
const ATTEMPT_WINDOW_MIN = 15;

const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 64, maxmem: 128 * 1024 * 1024 };

export function authExists() {
	return fs.existsSync(AUTH_FILE);
}

function loadAuth() {
	if (!authExists()) return null;
	try {
		return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
	} catch {
		return null;
	}
}

export function setPassword(password) {
	if (!password || password.length < 12) {
		throw new Error('password must be at least 12 characters');
	}
	const salt = crypto.randomBytes(16);
	const hash = crypto.scryptSync(password, salt, SCRYPT.keylen, SCRYPT).toString('base64');
	const existing = loadAuth() || {};
	const record = {
		salt: salt.toString('base64'),
		hash,
		sessionKey: existing.sessionKey || crypto.randomBytes(32).toString('base64'),
		updated: now(),
	};
	fs.writeFileSync(AUTH_FILE, JSON.stringify(record, null, 2), { mode: 0o600 });
	fs.chmodSync(AUTH_FILE, 0o600);
	return record;
}

export function verifyPassword(password) {
	const record = loadAuth();
	if (!record) return false;
	let candidate;
	try {
		candidate = crypto.scryptSync(password, Buffer.from(record.salt, 'base64'), SCRYPT.keylen, SCRYPT);
	} catch {
		return false;
	}
	const expected = Buffer.from(record.hash, 'base64');
	if (expected.length !== candidate.length) return false;
	return crypto.timingSafeEqual(expected, candidate);
}

// -------------------------------------------------------------- sessions ----

const sign = (payload) => {
	const record = loadAuth();
	if (!record) throw new Error('no admin password set');
	return crypto.createHmac('sha256', Buffer.from(record.sessionKey, 'base64')).update(payload).digest('base64url');
};

export function issueSession() {
	const expires = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
	const payload = `v1.${expires}`;
	return { value: `${payload}.${sign(payload)}`, expires: new Date(expires) };
}

export function readSession(cookieValue) {
	if (!cookieValue) return null;
	const parts = String(cookieValue).split('.');
	if (parts.length !== 3) return null;
	const [v, expires, mac] = parts;
	const payload = `${v}.${expires}`;
	let expected;
	try {
		expected = sign(payload);
	} catch {
		return null;
	}
	const a = Buffer.from(mac);
	const b = Buffer.from(expected);
	if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
	if (Number(expires) < Date.now()) return null;
	return { expires: Number(expires) };
}

export function cookieHeader(value, { clear = false } = {}) {
	if (clear) {
		return `${COOKIE_NAME}=; Path=/admin; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
	}
	return `${COOKIE_NAME}=${value}; Path=/admin; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}

export function csrfFor(sessionValue) {
	return crypto
		.createHmac('sha256', Buffer.from(loadAuth()?.sessionKey || 'x', 'base64'))
		.update(`csrf.${sessionValue}`)
		.digest('base64url')
		.slice(0, 32);
}

/** Same-origin check + csrf token check for state-changing requests. */
export function checkCsrf(req, sessionValue) {
	const token = req.body?._csrf || req.get('x-csrf-token') || '';
	const expected = csrfFor(sessionValue);
	if (token.length !== expected.length) return false;
	return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

// ----------------------------------------------------------- rate limiting --

export function recordAttempt(ip, ok) {
	db.prepare('INSERT INTO login_attempts (ip, at, ok) VALUES (?, ?, ?)').run(ip, now(), ok ? 1 : 0);
	// keep the table small
	db.prepare("DELETE FROM login_attempts WHERE at < datetime('now', '-2 days')").run();
}

export function lockoutRemaining(ip) {
	const row = db
		.prepare(
			`SELECT COUNT(*) AS n, MAX(at) AS last FROM login_attempts
			 WHERE ip = ? AND ok = 0 AND at > datetime('now', '-${ATTEMPT_WINDOW_MIN} minutes')`,
		)
		.get(ip);
	if (!row || !row.n || row.n < MAX_ATTEMPTS) return 0;
	const last = Date.parse(`${String(row.last).replace(' ', 'T')}Z`);
	const unlock = last + ATTEMPT_WINDOW_MIN * 60 * 1000;
	return Math.max(0, Math.ceil((unlock - Date.now()) / 1000));
}

export function clearAttempts(ip) {
	db.prepare('DELETE FROM login_attempts WHERE ip = ?').run(ip);
}
