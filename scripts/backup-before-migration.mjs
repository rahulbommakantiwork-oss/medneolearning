import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const publicRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = path.resolve(publicRoot, '..');

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const split = line.indexOf('=');
    if (split < 1) continue;
    const name = line.slice(0, split).trim();
    let value = line.slice(split + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[name] === undefined) process.env[name] = value;
  }
}
loadEnv(path.join(projectRoot, '.env'));
loadEnv(path.join(publicRoot, '.env'));

const url = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key || key.startsWith('sb_publishable_')) {
  throw new Error('Configure SUPABASE_URL and a server-only SUPABASE_SECRET_KEY (or legacy service-role key) in .env first.');
}

async function fetchPage(table, offset) {
  const headers = { apikey: key, Accept: 'application/json' };
  if (!key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${key}`;
  const response = await fetch(`${url}/rest/v1/${table}?select=*&limit=1000&offset=${offset}`, {
    headers,
    cache: 'no-store',
    signal: AbortSignal.timeout(30000)
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : []; } catch { data = text; }
  if (!response.ok) throw new Error(`Unable to back up table ${table} (HTTP ${response.status}). Confirm this table exists and the key has server access.`);
  if (!Array.isArray(data)) throw new Error(`Unexpected response while backing up table ${table}.`);
  return data;
}
async function fetchAll(table) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await fetchPage(table, offset);
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

// These are the tables in the original schema. This script runs before the additive analytics migration.
const tables = ['users', 'app_content', 'logs', 'whatsapp_messages', 'module_files'];
const snapshots = {};
for (const table of tables) {
  snapshots[table] = await fetchAll(table);
  process.stdout.write(`Backed up ${table}: ${snapshots[table].length} rows\n`);
}
const createdAt = new Date().toISOString();
const backup = {
  version: 1,
  createdAt,
  description: 'Pre-migration database snapshot. Restore only with a reviewed recovery procedure; this file contains password hashes and must remain private.',
  tables: snapshots
};
const backupDir = path.resolve(process.env.BACKUP_DIR || path.join(projectRoot, 'private-backups'));
fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
try { fs.chmodSync(backupDir, 0o700); } catch {}
const filename = `before-migration-${createdAt.replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}.json`;
const target = path.join(backupDir, filename);
fs.writeFileSync(target, JSON.stringify(backup, null, 2), { mode: 0o600, flag: 'wx' });
try { fs.chmodSync(target, 0o600); } catch {}
process.stdout.write(`Private snapshot written to ${target}\nThis directory is outside the deployed public/ app root. Encrypt and restrict access; never upload this file to a public repository. No database rows were changed or deleted.\n`);
