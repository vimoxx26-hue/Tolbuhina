import { DatabaseSync } from 'node:sqlite';
import { chmodSync, closeSync, existsSync, lstatSync, mkdirSync, openSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { validateLead } from './validation';

export type Lead = NonNullable<ReturnType<typeof validateLead>>;
export function storageMode() { return process.env.LEAD_STORAGE || 'sqlite'; }
export function registrationSecret() {
  const configured = process.env.REGISTRATION_SECRET;
  if (configured && configured.length >= 32) return configured;
  // Compatibility for existing Supabase deployments only; SQLite never uses a database key.
  if (storageMode() === 'supabase' && !configured) return process.env.SUPABASE_SECRET_KEY || null;
  return null;
}
export function storageConfigured() {
  if (!registrationSecret()) return false;
  if (storageMode() === 'sqlite') return !!process.env.LEAD_DB_PATH && isAbsolute(process.env.LEAD_DB_PATH);
  return storageMode() === 'supabase' && !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SECRET_KEY;
}
function inside(child: string, parent: string) {
  const part = relative(parent, child);
  return part === '' || (!part.startsWith(`..${sep}`) && part !== '..' && !isAbsolute(part));
}
function privateDatabasePath() {
  const configured = process.env.LEAD_DB_PATH;
  if (!configured || !isAbsolute(configured)) throw new Error('Absolute private database path required');
  const dbPath = resolve(configured);
  const dir = dirname(dbPath);
  // Never place personal data in the website's publicly served directory.
  if (inside(dbPath, resolve(process.cwd(), 'public')) || dir === process.cwd() || dir === dirname(process.cwd()) || dir === '/tmp' || dir === '/workspace' || dir === '/') throw new Error('Dedicated private directory required');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  // Do not follow a symlink into an unexpected or publicly exposed location.
  if (realpathSync(dir) !== dir || lstatSync(dir).isSymbolicLink()) throw new Error('Database directory must not be a symlink');
  const uid = process.getuid?.();
  if (uid !== undefined && statSync(dir).uid !== uid) throw new Error('Database directory must belong to this process');
  chmodSync(dir, 0o700);
  if (!existsSync(dbPath)) {
    try { closeSync(openSync(dbPath, 'wx', 0o600)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  }
  const file = lstatSync(dbPath);
  if (!file.isFile() || file.isSymbolicLink() || (uid !== undefined && file.uid !== uid)) throw new Error('Private regular database file required');
  chmodSync(dbPath, 0o600);
  return dbPath;
}
export function saveSQLiteLead(lead: Lead, id: string = randomUUID()) {
  const path = privateDatabasePath();
  const db = new DatabaseSync(path);
  try {
    db.exec(`PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS leads (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 100),
        phone TEXT NOT NULL CHECK(length(phone) BETWEEN 10 AND 20),
        telegram TEXT NOT NULL CHECK(length(telegram) BETWEEN 5 AND 33),
        consent INTEGER NOT NULL CHECK(consent = 1),
        consent_version TEXT NOT NULL,
        page TEXT NOT NULL CHECK(length(page) <= 2048),
        utm TEXT NOT NULL
      );`);
    db.prepare('INSERT INTO leads (id,created_at,name,phone,telegram,consent,consent_version,page,utm) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(id, new Date().toISOString(), lead.name, lead.phone, lead.telegram, 1, lead.consent_version, lead.page, JSON.stringify(lead.utm));
  } finally {
    db.close();
    for (const suffix of ['', '-wal', '-shm']) if (existsSync(/* turbopackIgnore: true */ `${path}${suffix}`)) chmodSync(`${path}${suffix}`, 0o600);
  }
}
export async function persistLead(lead: Lead, id?: string) {
  if (storageMode() === 'sqlite') { saveSQLiteLead(lead, id); return; }
  if (storageMode() !== 'supabase') throw new Error('Unsupported lead storage');
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Storage not configured');
  const endpoint = new URL('/rest/v1/leads', url);
  if (endpoint.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(endpoint.hostname))) throw new Error('Unsafe storage endpoint');
  const result = await fetch(endpoint, {
    method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(id ? {...lead, id} : lead), signal: AbortSignal.timeout(12000), cache: 'no-store',
  });
  if (!result.ok) throw new Error('Storage unavailable');
}
