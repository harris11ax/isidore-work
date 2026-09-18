// Publish: content.db -> site data -> static build -> Cloudflare Worker -> backup repo.
//
// Every step is a real child process so a failure stops the pipeline instead of
// half-publishing: nothing is deployed unless the build succeeded, and nothing is
// pushed unless the deploy succeeded.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { REPO, CONTENT_DIR } from './db.mjs';

export const LOG_FILE = path.join(CONTENT_DIR, 'publish.log');
export const ENV_FILE = path.join(CONTENT_DIR, 'publish.env');

const MAX_LOG_BYTES = 200 * 1024;
const INSTALL = { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 };
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function readEnvFile() {
	const out = {};
	if (!fs.existsSync(ENV_FILE)) return out;
	for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
		const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
		if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
	}
	return out;
}

function appendLog(text) {
	fs.mkdirSync(CONTENT_DIR, { recursive: true });
	fs.appendFileSync(LOG_FILE, text.endsWith('\n') ? text : `${text}\n`);
	try {
		const size = fs.statSync(LOG_FILE).size;
		if (size > MAX_LOG_BYTES) {
			const keep = fs.readFileSync(LOG_FILE, 'utf8').slice(-MAX_LOG_BYTES);
			fs.writeFileSync(LOG_FILE, `[log truncated]\n${keep}`);
		}
	} catch {
		/* ignore */
	}
}

export function lastPublishLog(lines = 60) {
	if (!fs.existsSync(LOG_FILE)) return '';
	const all = fs.readFileSync(LOG_FILE, 'utf8').trimEnd().split('\n');
	return all.slice(-lines).join('\n');
}

export function repoStatus() {
	const branch = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], INSTALL);
	const head = spawnSync('git', ['log', '-1', '--format=%h %s'], INSTALL);
	const dirty = spawnSync('git', ['status', '--porcelain'], INSTALL);
	const remote = spawnSync('git', ['remote', 'get-url', 'origin'], INSTALL);
	const n = (dirty.stdout || '').trim().split('\n').filter(Boolean).length;
	return [
		`branch: ${(branch.stdout || '?').trim()}`,
		`HEAD:   ${(head.stdout || '?').trim()}`,
		`remote: ${(remote.stdout || '?').trim()}`,
		`dirty:  ${n} file(s) not yet committed`,
	].join('\n');
}

/**
 * Run the pipeline.
 *   required: which steps must run for this publish to count as successful.
 *   --no-deploy / --no-push let the pipeline be exercised without touching the
 *   live site (used by the test harness).
 */
export async function runPublish({ trigger = 'manual', required = ['generate', 'build', 'deploy', 'push'], skip = [] } = {}) {
	const env = readEnvFile();
	const childEnv = { ...process.env, ...env };
	const stamp = new Date().toISOString();
	const log = [];
	const steps = [];
	let failedStep = null;

	const say = (line) => {
		log.push(line);
		appendLog(line);
	};

	say('');
	say(`===== publish ${stamp} (${trigger}) =====`);

	const run = (name, cmd, args, opts = {}) => {
		if (skip.includes(name)) {
			steps.push({ name, skipped: true });
			say(`--- ${name}: skipped`);
			return { ok: true, skipped: true };
		}
		say(`--- ${name}: ${cmd} ${args.join(' ')}`);
		const res = spawnSync(cmd, args, { ...INSTALL, env: childEnv, ...opts });
		const out = `${res.stdout || ''}${res.stderr || ''}`.trim();
		if (out) say(out);
		if (res.status !== 0) {
			failedStep = name;
			say(`--- ${name}: FAILED (exit ${res.status})`);
			return { ok: false };
		}
		steps.push({ name, ok: true });
		say(`--- ${name}: ok`);
		return { ok: true };
	};

	// 1. the database is the source of truth -> the site's data files
	if (!run('generate', process.execPath, ['--no-warnings', path.join(REPO, 'admin', 'generate.mjs')]).ok) {
		return { ok: false, failedStep, log: log.join('\n') };
	}

	// 2. build
	const build = run('build', npm, ['run', 'build']);
	if (!build.ok) return { ok: false, failedStep, log: log.join('\n') };

	// 3. deploy the Worker (needs CLOUDFLARE_API_TOKEN + ACCOUNT_ID in publish.env)
	if (required.includes('deploy') && !skip.includes('deploy')) {
		if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) {
			failedStep = 'deploy';
			say('--- deploy: FAILED — publish.env has no CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID');
			return { ok: false, failedStep, log: log.join('\n') };
		}
		if (!run('deploy', npx, ['wrangler', 'deploy']).ok) {
			return { ok: false, failedStep, log: log.join('\n') };
		}
	}

	// 4. commit and push to the GitHub backup repository
	if (required.includes('push') && !skip.includes('push')) {
		const dirty = spawnSync('git', ['status', '--porcelain'], INSTALL).stdout?.trim() || '';
		if (!dirty) {
			steps.push({ name: 'push', skipped: true });
			say('--- push: nothing to commit');
		} else {
			const changed = dirty.split('\n').length;
			if (!run('add', 'git', ['add', '-A']).ok) return { ok: false, failedStep, log: log.join('\n') };
			if (
				!run('commit', 'git', [
					'commit',
					'-m',
					`Publish content from the admin portal (${stamp.slice(0, 16).replace('T', ' ')})`,
				]).ok
			) {
				return { ok: false, failedStep, log: log.join('\n') };
			}
			say(`--- commit: ${changed} file(s) changed`);
			if (!run('push', 'git', ['push', 'origin', 'HEAD:main']).ok) {
				return { ok: false, failedStep, log: log.join('\n') };
			}
		}
	}

	say(`===== publish complete at ${new Date().toISOString()} =====`);
	return { ok: true, failedStep: null, steps, log: log.join('\n') };
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const skip = [];
	if (process.argv.includes('--no-deploy')) skip.push('deploy');
	if (process.argv.includes('--no-push')) skip.push('push');
	const required = ['generate', 'build', ...(skip.includes('deploy') ? [] : ['deploy']), ...(skip.includes('push') ? [] : ['push'])];
	const result = await runPublish({ trigger: 'cli', required, skip });
	console.log(result.log);
	process.exit(result.ok ? 0 : 1);
}
