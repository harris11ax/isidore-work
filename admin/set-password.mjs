// Set (or reset) the admin portal password.
//
//   npm run set-password             # prompts, input hidden
//   npm run set-password -- --stdin  # reads ONE line from stdin (for automation)
import { setPassword, AUTH_FILE } from './auth.mjs';

function promptHidden(question) {
	return new Promise((resolve, reject) => {
		process.stdout.write(question);
		const stdin = process.stdin;
		const wasRaw = stdin.isRaw;
		if (!stdin.isTTY) {
			reject(new Error('not a terminal — use --stdin'));
			return;
		}
		stdin.setRawMode(true);
		stdin.resume();
		stdin.setEncoding('utf8');
		let value = '';
		const onData = (chunk) => {
			for (const ch of chunk) {
				if (ch === '\r' || ch === '\n') {
					stdin.setRawMode(Boolean(wasRaw));
					stdin.pause();
					stdin.removeListener('data', onData);
					process.stdout.write('\n');
					resolve(value);
					return;
				}
				if (ch === '\u0003') {
					process.stdout.write('\n');
					process.exit(130);
				}
				if (ch === '\u007f' || ch === '\b') {
					value = value.slice(0, -1);
					continue;
				}
				value += ch;
			}
		};
		stdin.on('data', onData);
	});
}

async function readStdinLine() {
	const chunks = [];
	for await (const chunk of process.stdin) chunks.push(chunk);
	return Buffer.concat(chunks).toString('utf8').split('\n')[0].trim();
}

const useStdin = process.argv.includes('--stdin');
const argvPassword = process.argv.find((a) => a.startsWith('--password='));

let password;
if (argvPassword) password = argvPassword.slice('--password='.length);
else if (useStdin) password = await readStdinLine();
else {
	password = await promptHidden('New admin password: ');
	const again = await promptHidden('Repeat: ');
	if (password !== again) {
		console.error('passwords do not match');
		process.exit(1);
	}
}

try {
	setPassword(password);
	console.log(`password set (${AUTH_FILE})`);
} catch (error) {
	console.error(`could not set password: ${error.message}`);
	process.exit(1);
}
