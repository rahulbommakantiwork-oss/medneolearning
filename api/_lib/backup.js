import { select, supabaseFetch } from './db.js';

const PAGE_SIZE = 1000;
const BACKUP_TABLES = [
  ['users', 'created_at.asc,id.asc'],
  ['app_content', 'key.asc'],
  ['logs', 'id.asc'],
  ['analytics_events', 'id.asc'],
  ['quiz_attempts', 'id.asc'],
  ['whatsapp_messages', 'id.asc'],
  ['module_files', 'id.asc'],
  ['auth_attempts', 'id.asc'],
  ['registration_attempts', 'id.asc'],
  ['password_setup_tokens', 'id.asc']
];

async function uploadJson(objectPath, value) {
  return supabaseFetch(`/storage/v1/object/backups/${objectPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-upsert': 'false' },
    body: JSON.stringify(value)
  });
}

async function backupTable(table, order, basePath, createdAt) {
  let offset = 0;
  let chunkIndex = 0;
  const objects = [];
  while (true) {
    const rows = await select(table, `select=*&order=${encodeURIComponent(order)}&limit=${PAGE_SIZE}&offset=${offset}`);
    if (!Array.isArray(rows)) throw new Error(`Unexpected backup response for ${table}`);
    if (rows.length) {
      const objectPath = `${basePath}/tables/${table}-${String(chunkIndex + 1).padStart(5, '0')}.json`;
      await uploadJson(objectPath, {
        schemaVersion: 3,
        table,
        chunkIndex,
        rowOffset: offset,
        createdAt,
        rows
      });
      objects.push(objectPath);
      offset += rows.length;
      chunkIndex += 1;
    }
    if (rows.length < PAGE_SIZE) break;
    if (chunkIndex >= 10000) throw new Error(`Backup safety limit reached for ${table}; no manifest was published.`);
  }
  return { rows: offset, chunks: chunkIndex, objects };
}

export async function createDatabaseBackup(source = 'manual') {
  const createdAt = new Date().toISOString();
  const timestamp = createdAt.replace(/[:.]/g, '-');
  const basePath = `${source}/${timestamp}`;

  // Stream each table to private storage in small chunks so long event histories are not silently truncated.
  // The manifest is written last; incomplete runs have no completed manifest and never replace an older backup.
  const results = {};
  for (const [table, order] of BACKUP_TABLES) {
    results[table] = await backupTable(table, order, basePath, createdAt);
  }

  const manifest = {
    schemaVersion: 3,
    createdAt,
    completedAt: new Date().toISOString(),
    source,
    consistency: 'Tables are read sequentially in stable pages; use Supabase managed backups/PITR for transactionally consistent point-in-time recovery.',
    preservation: 'Snapshot only; no rows or published content are deleted or modified by this endpoint.',
    tables: Object.fromEntries(Object.entries(results).map(([table, result]) => [table, { rows: result.rows, chunks: result.chunks, objects: result.objects }]))
  };
  const manifestPath = `${basePath}/manifest.json`;
  await uploadJson(manifestPath, manifest);

  return {
    path: manifestPath,
    createdAt,
    counts: Object.fromEntries(Object.entries(results).map(([table, result]) => [table, result.rows])),
    chunks: Object.fromEntries(Object.entries(results).map(([table, result]) => [table, result.chunks]))
  };
}
