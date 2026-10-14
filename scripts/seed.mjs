import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

/*
  ============================================================
  MEDNEO / MEDLEARN SEED SCRIPT
  - Windows / macOS / Linux compatible
  - Reads .env automatically
  - Supports new Supabase secret keys
  - Supports old service_role keys as fallback
  - Never uses localStorage
  - Uses Supabase REST API server-side
  ============================================================
*/

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/*
  Current expected structure:

  medneo_learning/
  ├── .env
  └── public/
      ├── js/
      │   └── data.legacy.js
      └── scripts/
          └── seed.mjs

  Therefore:
  __dirname   = public/scripts
  publicRoot  = public
  projectRoot = medneo_learning
*/

const publicRoot = path.resolve(__dirname, '..');
const projectRoot = path.resolve(publicRoot, '..');

/* ============================================================
   LOAD .ENV
   ============================================================ */

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const text = fs.readFileSync(filePath, 'utf8');

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const eq = line.indexOf('=');

    if (eq === -1) {
      continue;
    }

    const name = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (name && process.env[name] === undefined) {
      process.env[name] = value;
    }
  }
}

/* Primary location: project-root .env. */
loadDotEnv(path.join(projectRoot, '.env'));

/*
  Fallback in case somebody accidentally puts .env inside public
*/
loadDotEnv(path.join(publicRoot, '.env'));

/* ============================================================
   SUPABASE CONFIG
   ============================================================ */

const url = (process.env.SUPABASE_URL || '').trim();

/*
  New Supabase key:
    SUPABASE_SECRET_KEY=sb_secret_...

  Legacy fallback:
    SUPABASE_SERVICE_ROLE_KEY=...
*/
const key = (
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  ''
).trim();

if (!url) {
  throw new Error(
    'Missing SUPABASE_URL. Put SUPABASE_URL in the .env file.'
  );
}

if (!key) {
  throw new Error(
    'Missing SUPABASE_SECRET_KEY. Put your Supabase server Secret Key in the .env file.'
  );
}

if (key.startsWith('sb_publishable_')) {
  throw new Error(
    'You are using a SUPABASE PUBLISHABLE key. Use a SUPABASE SECRET key beginning with sb_secret_ instead.'
  );
}

console.log('Supabase URL loaded.');
console.log(
  key.startsWith('sb_secret_')
    ? 'Supabase server Secret Key loaded.'
    : 'Legacy Supabase service_role key loaded.'
);

/* ============================================================
   PASSWORD HASHING
   ============================================================ */

const scrypt = promisify(crypto.scrypt);

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);

  const dk = await scrypt(
    password,
    salt,
    64,
    {
      N: 16384,
      r: 8,
      p: 1
    }
  );

  return [
    'scrypt',
    '16384',
    '8',
    '1',
    salt.toString('base64url'),
    Buffer.from(dk).toString('base64url')
  ].join('$');
}

/* ============================================================
   SUPABASE REST API
   ============================================================ */

async function db(endpoint, opts = {}) {
  const cleanUrl = url.replace(/\/+$/, '');

  const response = await fetch(
    `${cleanUrl}/rest/v1/${endpoint}`,
    {
      ...opts,

      headers: {
        /* New sb_secret_ keys are not JWTs, so use only apikey for them.
           Legacy service_role JWT keys also require Authorization: Bearer. */
        apikey: key,
        'Content-Type': 'application/json',
        ...(key.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${key}` }),
        ...(opts.headers || {})
      }
    }
  );

  const text = await response.text();

  let data;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(
      JSON.stringify(
        {
          status: response.status,
          response: data
        },
        null,
        2
      )
    );
  }

  return data;
}

/* ============================================================
   FIND LEGACY DATA FILE
   ============================================================ */

const legacyCandidates = [
  path.resolve(publicRoot, 'js', 'data.legacy.js'),
  path.resolve(projectRoot, 'public', 'js', 'data.legacy.js'),
  path.resolve(projectRoot, 'js', 'data.legacy.js'),
  path.resolve(process.cwd(), 'public', 'js', 'data.legacy.js'),
  path.resolve(process.cwd(), 'js', 'data.legacy.js')
];

const legacyPath = legacyCandidates.find((candidate) =>
  fs.existsSync(candidate)
);

if (!legacyPath) {
  throw new Error(
    [
      'Could not find data.legacy.js.',
      '',
      'The script checked:',
      ...legacyCandidates.map((p) => ` - ${p}`)
    ].join('\n')
  );
}

console.log(`Using legacy data file: ${legacyPath}`);

/* ============================================================
   READ LEGACY DB
   ============================================================ */

const source = fs.readFileSync(legacyPath, 'utf8');

const context = {};

vm.createContext(context);

const transformedSource = source.replace(
  /const\s+DB\s*=\s*/,
  'globalThis.DB = '
);

vm.runInContext(transformedSource, context);

const DB = context.DB;

if (!DB) {
  throw new Error(
    `Could not read DB from ${legacyPath}`
  );
}

/* ============================================================
   PREPARE APPLICATION CONTENT
   ============================================================ */

const content = {
  modules: DB.modules || [],
  slideDecks: DB.slideDecks || [],
  articles: DB.articles || [],
  quizzes: DB.quizzes || [],
  stateCities: DB.stateCities || []
};

/* ============================================================
   INSERT APPLICATION CONTENT — INSERT ONLY
   Existing live content is never replaced by this seed script.
   ============================================================ */

console.log('Checking application content...');
const existingContent = await db('app_content?select=key&key=eq.main&limit=1');
if (Array.isArray(existingContent) && existingContent.length > 0) {
  console.log('Existing app_content/main found. Skipping content seed to protect published articles.');
} else {
  console.log('No main content record found; importing the legacy content once.');
  await db('app_content?on_conflict=key', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({ key: 'main', payload: content, updated_at: new Date().toISOString() })
  });
  console.log('Initial content import complete.');
}

/* ============================================================
   ADMIN BOOTSTRAP — EXPLICIT CREDENTIALS ONLY
   Existing records are never updated by this script; doctors are added by an admin.
   ============================================================ */

const adminEmail = String(process.env.SEED_ADMIN_EMAIL || '').trim().toLowerCase();
const adminPassword = String(process.env.SEED_ADMIN_PASSWORD || '');
if (!adminEmail || !adminPassword) {
  console.log('SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not both configured; no account records were created or changed.');
} else {
  if (adminPassword.length < 12) throw new Error('SEED_ADMIN_PASSWORD must be at least 12 characters.');
  const existingAdmins = await db(`users?select=id,email,role&email=eq.${encodeURIComponent(adminEmail)}&limit=1`);
  if (Array.isArray(existingAdmins) && existingAdmins.length > 0) {
    if (existingAdmins[0].role !== 'admin') throw new Error('SEED_ADMIN_EMAIL already belongs to a non-admin account.');
    console.log('Admin account already exists. Keeping its current password and profile unchanged.');
  } else {
    const id = `admin_${crypto.randomBytes(10).toString('hex')}`;
    const now = new Date().toISOString();
    await db('users?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify([{
        id, name: 'Super Admin', email: adminEmail, phone: null, state: null, city: null,
        specialization: null, experience: null, degree: null, hospital: null, registration_number: null,
        role: 'admin', status: 'active', password_hash: await hashPassword(adminPassword),
        last_login: null, session_duration: '—', modules: [], completed_modules: [],
        onboarded: true, score: 0, streak: 0, created_at: now, updated_at: now
      }])
    });
    console.log('Admin account created without touching existing users.');
  }
}
console.log('Seed finished. No delete operation is included.');
