import { createHash } from 'node:crypto';
const attempts = new Map<string, { count: number; until: number }>();
// Per-process protection; production deployments should add a shared edge/WAF rate limit.
export function rateLimited(request: Request, route: string, limit = 8) {
  const now = Date.now();
  for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
  const address = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const key = createHash('sha256').update(`${route}:${address}`).digest('hex');
  const old = attempts.get(key);
  if (old && old.until > now) { old.count++; return old.count > limit; }
  if (attempts.size > 10000) return true;
  attempts.set(key, { count: 1, until: now + 10 * 60 * 1000 });
  return false;
}
export function validOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    const supplied = new URL(origin);
    if (!['http:', 'https:'].includes(supplied.protocol)) return false;
    if (process.env.SITE_URL) return supplied.origin === new URL(process.env.SITE_URL).origin;
    // Next.js can use the bind address internally; compare the browser-facing Host.
    return supplied.host === (request.headers.get('host') || new URL(request.url).host);
  } catch { return false; }
}
export async function readSmallJson(request: Request) {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new Error('invalid');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('invalid');
  let size = 0; const chunks: Uint8Array[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 8192) { await reader.cancel(); throw new Error('too-large'); }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export function apiError(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}
