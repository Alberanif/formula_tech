export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ok:false});

  const databaseConfigured = Boolean(process.env.DATABASE_URL);
  const pepperConfigured = (process.env.ROOM_CODE_PEPPER?.length || 0) >= 32;
  const environment = process.env.VERCEL_ENV || 'unknown';
  const matchingKeys = Object.keys(process.env).filter(key => /DATABASE|PEPPER|CRON|NEON/i.test(key)).sort();

  try {
    await import('../server/db.js');
    return res.status(200).json({ok:true,environment,databaseConfigured,pepperConfigured,matchingKeys});
  } catch (error: any) {
    const message = String(error?.message || '');
    const kind = message.includes('DATABASE_URL não configurada') ? 'DATABASE_URL_MISSING'
      : message.includes('ROOM_CODE_PEPPER precisa') ? 'ROOM_CODE_PEPPER_INVALID'
      : 'MODULE_INIT_FAILED';
    const detail = message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[redacted]').replace(/npg_[A-Za-z0-9]+/g, '[redacted]').slice(0, 300);
    return res.status(503).json({ok:false,environment,databaseConfigured,pepperConfigured,matchingKeys,kind,detail});
  }
}
