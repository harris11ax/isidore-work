// /admin/* on the public Worker: a thin, path-preserving reverse proxy to the
// admin application running on izzyserver over the Cloudflare tunnel.
//
// Everything else on this Worker stays prerendered static assets — this is the
// only on-demand route on the site, and it exists so the admin portal can live
// at https://isidore.work/admin while the application, its content database and
// the uploaded media all live on the home server.
export const prerender = false;

import type { APIRoute } from 'astro';

// Hop-by-hop headers must not be forwarded (RFC 9110 §7.6.1), plus the two
// Workers rewrites for us: content-encoding/length are recomputed on re-send.
const STRIP = new Set([
	'connection',
	'keep-alive',
	'proxy-authenticate',
	'proxy-authorization',
	'te',
	'trailer',
	'transfer-encoding',
	'upgrade',
	'content-encoding',
	'content-length',
]);

export const ALL: APIRoute = async ({ request, locals }) => {
	const env = (((locals as unknown as { runtime?: { env?: Record<string, string> } })?.runtime?.env) ??
		{}) as Record<string, string | undefined>;
	const origin = env.ADMIN_ORIGIN;
	if (!origin) {
		return new Response('admin backend is not configured on this Worker', {
			status: 503,
			headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' },
		});
	}

	const inbound = new URL(request.url);
	const target = new URL(origin);
	const outbound = new URL(inbound.pathname + inbound.search, target);

	const headers = new Headers(request.headers);
	headers.set('host', target.host);
	headers.set('x-forwarded-host', inbound.host);
	headers.set('x-forwarded-proto', inbound.protocol.replace(':', ''));
	// Lets the backend refuse requests that did not come through the Worker.
	if (env.ADMIN_PROXY_SECRET) headers.set('x-isidore-proxy', env.ADMIN_PROXY_SECRET);

	const method = request.method.toUpperCase();
	const hasBody = method !== 'GET' && method !== 'HEAD';

	let upstream: Response;
	try {
		upstream = await fetch(outbound.toString(), {
			method,
			headers,
			body: hasBody ? request.body : undefined,
			redirect: 'manual',
		} as RequestInit);
	} catch (error) {
		return new Response(`admin backend unreachable: ${(error as Error).message}`, {
			status: 502,
			headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' },
		});
	}

	const out = new Headers();
	upstream.headers.forEach((value, key) => {
		const k = key.toLowerCase();
		if (STRIP.has(k) || k === 'set-cookie') return;
		out.set(key, value);
	});

	// Multiple Set-Cookie headers have to survive individually (session + csrf).
	const upstreamAny = upstream.headers as Headers & { getSetCookie?: () => string[] };
	const cookies = upstreamAny.getSetCookie?.() ?? [];
	for (const cookie of cookies) out.append('set-cookie', cookie);

	if (!out.has('cache-control')) out.set('cache-control', 'no-store');

	return new Response(upstream.body, { status: upstream.status, headers: out });
};
