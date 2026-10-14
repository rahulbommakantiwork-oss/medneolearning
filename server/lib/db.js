/* Shared Supabase REST helpers used by the MedNeo API routes.
   Environment variables are read at request time so local .env loading works. */
function supabaseConfig() {
  const url = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = String(
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ''
  ).trim();

  if (!url) throw new Error('Missing environment variable: SUPABASE_URL');
  if (!key) throw new Error('Missing environment variable: SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)');
  return { url, key };
}

function makeHeaders(key, extra = {}) {
  const result = {
    apikey: key,
    'Content-Type': 'application/json',
    ...extra
  };

  // Supabase sb_secret_* keys are not JWTs and must not be sent as Bearer tokens.
  if (!key.startsWith('sb_secret_')) result.Authorization = `Bearer ${key}`;
  return result;
}

export async function supabaseFetch(path, options = {}) {
  const { url, key } = supabaseConfig();
  const cleanPath = String(path || '');
  if (!cleanPath.startsWith('/')) throw new Error('Supabase REST path must start with /.');

  const response = await fetch(`${url}${cleanPath}`, {
    ...options,
    headers: makeHeaders(key, options.headers || {}),
    signal: options.signal || AbortSignal.timeout(15000)
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; }
  catch { data = text; }

  if (!response.ok) {
    const detail = data && typeof data === 'object'
      ? (data.message || data.hint || data.details || data.error_description || data.error)
      : data;
    const error = new Error(detail || `Supabase request failed with HTTP ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

export async function select(table, query = '') {
  const suffix = String(query || '').replace(/^\?/, '');
  return supabaseFetch(`/rest/v1/${encodeURIComponent(table)}${suffix ? `?${suffix}` : ''}`, {
    headers: { Prefer: 'return=representation' }
  });
}

export async function insert(table, row, query = '') {
  const suffix = String(query || '').replace(/^\?/, '');
  return supabaseFetch(`/rest/v1/${encodeURIComponent(table)}${suffix ? `?${suffix}` : ''}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(row)
  });
}

export async function update(table, query, patch) {
  const suffix = String(query || '').replace(/^\?/, '');
  if (!suffix) throw new Error('Update query filter is required.');
  return supabaseFetch(`/rest/v1/${encodeURIComponent(table)}?${suffix}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(patch)
  });
}

export async function remove(table, query = '') {
  const suffix = String(query || '').replace(/^\?/, '');
  if (!suffix) throw new Error('Delete query filter is required.');
  return supabaseFetch(`/rest/v1/${encodeURIComponent(table)}?${suffix}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' }
  });
}

export async function selectAll(table, query = '', options = {}) {
  const pageSize = Math.max(100, Math.min(1000, Number(options.pageSize) || 1000));
  const maxRows = Math.max(pageSize, Math.min(50000, Number(options.maxRows) || 20000));
  const base = String(query || '')
    .replace(/(^|&)limit=[^&]*/g, '')
    .replace(/(^|&)offset=[^&]*/g, '')
    .replace(/^&+|&+$/g, '');
  const results = [];

  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const suffix = `${base ? `${base}&` : ''}limit=${pageSize}&offset=${offset}`;
    const page = await select(table, suffix);
    if (!Array.isArray(page) || page.length === 0) break;
    results.push(...page);
    if (page.length < pageSize) break;
  }
  return results;
}
