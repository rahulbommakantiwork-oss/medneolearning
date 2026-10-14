
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  const configuration = {
    supabaseUrl: Boolean(String(process.env.SUPABASE_URL || '').trim()),
    supabaseServerKey: Boolean(String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()),
    sessionSecret: String(process.env.GML_SESSION_SECRET || '').trim().length >= 32
  };
  const ready = Object.values(configuration).every(Boolean);
  let database = 'not_checked';
  let databaseErrorCode = null;
  if (ready && new URL(req.url, 'http://localhost').searchParams.get('check') === 'registration') {
    try {
      // Validate only required table/columns; never return rows or secrets.
      const { select } = await import('./_lib/db.js');
      await select('users', 'select=id,name,email,phone,degree,city,state,role,status,password_hash,password_set_at,welcome_email_opt_in,welcome_email_status,phone_verified,created_at,updated_at&limit=0');
      await select('registration_attempts', 'select=id,email_hash,ip_hash,created_at&limit=0');
      database = 'ready_for_registration';
    } catch (error) {
      database = 'needs_setup';
      databaseErrorCode = String(error?.data?.code || error?.code || 'DATABASE_ERROR').slice(0, 30);
    }
  }
  const healthy = ready && database !== 'needs_setup';
  res.status(healthy ? 200 : 503).json({
    ok: healthy,
    service: 'medneo-api',
    configuration,
    ...(new URL(req.url, 'http://localhost').searchParams.get('check') === 'registration' ? { database, databaseErrorCode } : {}),
    time: new Date().toISOString()
  });
}
