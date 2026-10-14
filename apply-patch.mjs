import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Run this script with the MedNeo Vercel project root as the current working directory.
const root = path.resolve(process.cwd());
const apiDir = path.join(root, 'api');
const vercelFile = path.join(root, 'vercel.json');
const packageFile = path.join(root, 'package.json');
const routeStore = path.join(root, 'server', 'api');
const fail = (message) => { console.error(`\nSTOPPED SAFELY: ${message}`); process.exit(1); };
const slash = (p) => p.split(path.sep).join('/');
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const backupRoot = path.resolve(root, '..', `${path.basename(root)}-pre-vercel-consolidation-${stamp}`);
const isInsidePrivateHelperFolder = (rel) => rel.split(path.sep).some((part) => part.startsWith('_') || part.startsWith('.'));

for (const [label, file] of [['package.json', packageFile], ['vercel.json', vercelFile], ['api/', apiDir]]) {
  if (!fs.existsSync(file)) fail(`Missing ${label}. Run this command from the project root containing api/, package.json and vercel.json.`);
}
if (!fs.statSync(apiDir).isDirectory()) fail('api exists but is not a directory. No files were changed.');
if (fs.existsSync(routeStore)) fail('server/api already exists. Nothing was changed; inspect that folder before applying a second consolidation patch.');
if (fs.existsSync(path.join(apiDir, 'index.js'))) fail('api/index.js already exists and would conflict with the consolidated entry point. No files were changed.');

let config;
try {
  config = JSON.parse(fs.readFileSync(vercelFile, 'utf8'));
} catch (error) {
  fail(`vercel.json is not valid JSON (${error.message}). No files were changed.`);
}

// Find all current JS route handlers, excluding private/helper folders such as api/_lib.
function walkFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walkFiles(full) : entry.isFile() ? [full] : [];
  });
}
const apiFiles = walkFiles(apiDir);
const routeFiles = apiFiles
  .filter((file) => file.endsWith('.js'))
  .map((file) => ({ absolute: file, relative: path.relative(apiDir, file) }))
  .filter(({ relative }) => !isInsidePrivateHelperFolder(relative))
  .sort((a, b) => slash(a.relative).localeCompare(slash(b.relative)));

const unsupportedEntrypoints = apiFiles.filter((file) => /\.(mjs|cjs|ts|tsx|jsx|py|go|rs|rb|php)$/i.test(file));
if (unsupportedEntrypoints.length) {
  fail(`Found non-JavaScript API entry files this patch will not dispatch automatically:\n${unsupportedEntrypoints.map((f) => `  ${slash(path.relative(root, f))}`).join('\n')}\nNo files were changed.`);
}
if (!routeFiles.length) fail('No route handlers found under api/ outside private helper folders. No files were changed.');

for (const { relative, absolute } of routeFiles) {
  if (!/export\s+default\b/.test(fs.readFileSync(absolute, 'utf8'))) {
    fail(`${slash(path.join('api', relative))} does not contain an export default handler. No files were changed.`);
  }
  if (slash(relative) === 'index.js') fail('api/index.js is reserved for the consolidated entry point. No files were changed.');
  if (slash(relative).includes('[...')) fail(`${slash(path.join('api', relative))} is already a catch-all handler. This needs a source-specific merge; no files were changed.`);
}

// Existing API function-specific config cannot be silently discarded. This source pattern is
// migrated to the single new entry point; unrelated function configs are preserved.
const functionsConfig = (config.functions && typeof config.functions === 'object') ? config.functions : {};
const allowedApiFunctionKeys = new Set(['api/**/*.js', 'api/index.js']);
const conflictingFunctionKeys = Object.keys(functionsConfig).filter((key) => key.startsWith('api/') && !allowedApiFunctionKeys.has(key));
if (conflictingFunctionKeys.length) {
  fail(`vercel.json contains API-specific function settings that need individual review before consolidation:\n${conflictingFunctionKeys.map((k) => `  ${k}`).join('\n')}\nNo files were changed.`);
}

// Existing API rewrites are ambiguous, so refuse to guess and overwrite them.
const rewrites = Array.isArray(config.rewrites) ? config.rewrites : [];
const conflictingRewrites = rewrites.filter((rule) => typeof rule?.source === 'string' && /^\/?api(?:\/|$)/i.test(rule.source.replace(/^\^/, '')));
if (conflictingRewrites.length) {
  fail('vercel.json already contains rewrite rules for /api. No files were changed; those rules must be reviewed before adding the consolidated route.');
}

// Compile endpoint names using the actual current API tree. Example: module/[id].js => module/:id.
const routeDescriptors = routeFiles.map(({ relative }) => {
  const clean = slash(relative).replace(/\.js$/i, '');
  const segments = clean.split('/');
  if (segments.at(-1) === 'index') segments.pop();
  if (segments.some((seg) => /^\[\.\.\./.test(seg))) fail(`Unsupported catch-all segment in ${clean}. No files were changed.`);
  const template = segments.join('/');
  return { relative: slash(relative), template, dynamicCount: segments.filter((seg) => /^\[[^\]]+\]$/.test(seg)).length };
}).sort((a, b) => a.dynamicCount - b.dynamicCount || b.template.split('/').length - a.template.split('/').length || a.template.localeCompare(b.template));

const imports = routeDescriptors.map((route, i) => `import route${i} from ${JSON.stringify(`../server/api/${route.relative}`)};`).join('\n');
const routeList = routeDescriptors.map((route, i) => `  { template: ${JSON.stringify(route.template)}, handler: route${i} },`).join('\n');
const routerSource = String.raw`${imports}

const routeDefinitions = [
${routeList}
].map((route) => compileRoute(route));

function escapeRegex(value) {
  return value.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
}
function compileRoute(route) {
  const params = [];
  const segments = route.template ? route.template.split('/') : [];
  const pattern = segments.map((segment) => {
    const match = segment.match(/^\[([^\]]+)\]$/);
    if (match) {
      params.push(match[1]);
      return '([^/]+)';
    }
    return escapeRegex(segment);
  }).join('/');
  return { ...route, params, matcher: new RegExp('^' + pattern + '$') };
}
function firstValue(value) {
  return Array.isArray(value) ? value[0] : value;
}
function requestedPath(req) {
  // The vercel.json rewrite passes the original endpoint in __route; URL parsing is a local fallback.
  const routed = firstValue(req.query?.__route);
  if (routed !== undefined && routed !== null && String(routed).trim() !== '') {
    return String(routed).replace(/^\/+|\/+$/g, '');
  }
  const parsed = new URL(req.url || '/', 'http://localhost');
  return parsed.pathname.replace(/^\/api(?=\/|$)/i, '').replace(/^\/+|\/+$/g, '');
}
export default async function handler(req, res) {
  const endpoint = requestedPath(req);
  for (const route of routeDefinitions) {
    const match = route.matcher.exec(endpoint);
    if (!match) continue;
    const query = { ...(req.query || {}) };
    delete query.__route;
    for (let i = 0; i < route.params.length; i++) {
      try { query[route.params[i]] = decodeURIComponent(match[i + 1]); }
      catch { query[route.params[i]] = match[i + 1]; }
    }
    req.query = query;
    return await route.handler(req, res);
  }
  return res.status(404).json({ error: 'API route not found' });
}
`;

const originalVercelBytes = fs.readFileSync(vercelFile);
let movedApi = false;
let wroteRouter = false;
let updatedVercel = false;
try {
  fs.mkdirSync(backupRoot, { recursive: false });
  fs.cpSync(apiDir, path.join(backupRoot, 'api'), { recursive: true });
  fs.copyFileSync(vercelFile, path.join(backupRoot, 'vercel.json'));

  fs.mkdirSync(path.dirname(routeStore), { recursive: true });
  fs.renameSync(apiDir, routeStore);
  movedApi = true;
  fs.mkdirSync(apiDir, { recursive: false });
  fs.writeFileSync(path.join(apiDir, 'index.js'), routerSource, 'utf8');
  wroteRouter = true;

  // Preserve the user's existing headers, cron schedule, schema and other config. Only redirect API
  // requests to one function and move the function-duration rule to that new entry point.
  config.rewrites = [
    { source: '/api/:path*', destination: '/api/index?__route=:path*' },
    ...rewrites
  ];
  const oldWildcard = functionsConfig['api/**/*.js'] || {};
  const oldExact = functionsConfig['api/index.js'] || {};
  delete functionsConfig['api/**/*.js'];
  functionsConfig['api/index.js'] = {
    ...oldWildcard,
    ...oldExact,
    maxDuration: oldExact.maxDuration ?? oldWildcard.maxDuration ?? 15
  };
  config.functions = functionsConfig;
  fs.writeFileSync(vercelFile, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  updatedVercel = true;

  // Syntax checks do not need network access, secrets, or Supabase credentials.
  const jsFiles = walkFiles(routeStore).filter((file) => file.endsWith('.js'));
  const checkFiles = [path.join(apiDir, 'index.js'), ...jsFiles];
  for (const file of checkFiles) {
    const result = spawnSync(process.execPath, ['--check', file], { cwd: root, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`Syntax check failed for ${slash(path.relative(root, file))}:\n${result.stderr || result.stdout}`);
  }
  JSON.parse(fs.readFileSync(vercelFile, 'utf8'));

  console.log('\nPATCH APPLIED.');
  console.log(`Existing API route handlers moved without rewriting their contents: ${routeDescriptors.length}`);
  console.log('Vercel function entry files under api/: 1 (api/index.js).');
  console.log('Kept custom headers and /api/cron/backup cron configuration; updated only API rewrite and function-duration mapping.');
  console.log('package.json, Supabase tables/data, environment variables and secrets were not changed.');
  console.log(`Syntax checks passed for ${checkFiles.length} JavaScript files.`);
  console.log(`Rollback backup: ${backupRoot}`);
  console.log('Next: test with `vercel deploy` before production.');
} catch (error) {
  console.error(`\nPATCH FAILED: ${error.message}`);
  try {
    if (wroteRouter && fs.existsSync(apiDir)) fs.rmSync(apiDir, { recursive: true, force: true });
    else if (fs.existsSync(apiDir) && movedApi) fs.rmSync(apiDir, { recursive: true, force: true });
    if (movedApi && fs.existsSync(routeStore)) fs.renameSync(routeStore, apiDir);
    if (!fs.existsSync(apiDir) && fs.existsSync(path.join(backupRoot, 'api'))) fs.cpSync(path.join(backupRoot, 'api'), apiDir, { recursive: true });
    if (updatedVercel || !originalVercelBytes.equals(fs.readFileSync(vercelFile))) fs.writeFileSync(vercelFile, originalVercelBytes);
    console.error('Rollback completed. Existing API files and vercel.json were restored.');
    console.error(`Backup retained at: ${backupRoot}`);
  } catch (rollbackError) {
    console.error(`ROLLBACK NEEDS ATTENTION: ${rollbackError.message}`);
    console.error(`Manual backup is available at: ${backupRoot}`);
  }
  process.exit(1);
}
