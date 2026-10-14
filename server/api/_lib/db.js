const SUPABASE_URL = process.env.SUPABASE_URL;

const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;

function requireEnv(name, value) {
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
}

function headers(extra = {}) {
  requireEnv('SUPABASE_URL', SUPABASE_URL);
  requireEnv(
    'SUPABASE_SECRET_KEY',
    SUPABASE_SECRET_KEY
  );

  const result = {
    apikey: SUPABASE_SECRET_KEY,
    'Content-Type': 'application/json',
    ...extra,
  };

  /*
    New Supabase secret keys:
      sb_secret_...

    These are not JWTs, so don't send them as:
      Authorization: Bearer sb_secret_...

    Legacy service_role keys are JWTs, so keep
    Authorization support for backward compatibility.
  */
  if (!SUPABASE_SECRET_KEY.startsWith('sb_secret_')) {
    result.Authorization =
      `Bearer ${SUPABASE_SECRET_KEY}`;
  }

  return result;
}

export async function supabaseFetch(path, options = {}) {
  requireEnv('SUPABASE_URL', SUPABASE_URL);

  const response = await fetch(
    `${SUPABASE_URL}${path}`,
    {
      ...options,
      headers: headers(options.headers || {}),
    }
  );

  const text = await response.text();

  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const error = new Error(
      data?.message ||
      data?.hint ||
      data?.error ||
      `Supabase error ${response.status}`
    );

    error.status = response.status;
    error.data = data;

    throw error;
  }

  return data;
}

export async function select(
  table,
  query = ''
) {
  return supabaseFetch(
    `/rest/v1/${table}?${query}`,
    {
      headers: {
        Prefer: 'return=representation',
      },
    }
  );
}

export async function insert(
  table,
  row,
  query = ''
) {
  return supabaseFetch(
    `/rest/v1/${table}${query ? `?${query}` : ''}`,
    {
      method: 'POST',
      headers: {
        Prefer: 'return=representation',
      },
      body: JSON.stringify(row),
    }
  );
}

export async function update(
  table,
  query,
  patch
) {
  return supabaseFetch(
    `/rest/v1/${table}?${query}`,
    {
      method: 'PATCH',
      headers: {
        Prefer: 'return=representation',
      },
      body: JSON.stringify(patch),
    }
  );
}

export async function selectAll(table, query = '', options = {}) {
  const pageSize = Math.max(100, Math.min(1000, Number(options.pageSize) || 1000));
  const maxRows = Math.max(pageSize, Math.min(50000, Number(options.maxRows) || 20000));
  const base = String(query || '').replace(/(^|&)limit=[^&]*/g, '').replace(/(^|&)offset=[^&]*/g, '').replace(/^&+|&+$/g, '');
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


export async function remove(table, query = '') {
  const suffix = query ? `?${query}` : '';
  return supabaseFetch(`/rest/v1/${table}${suffix}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });
}
