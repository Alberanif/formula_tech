export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ok:false});

  const databaseConfigured = Boolean(process.env.DATABASE_URL);
  const pepperConfigured = (process.env.ROOM_CODE_PEPPER?.length || 0) >= 32;

  try {
    await import('../server/db.ts');
    return res.status(200).json({ok:true,databaseConfigured,pepperConfigured});
  } catch (error: any) {
    const message = String(error?.message || '');
    const kind = message.includes('DATABASE_URL não configurada') ? 'DATABASE_URL_MISSING'
      : message.includes('ROOM_CODE_PEPPER precisa') ? 'ROOM_CODE_PEPPER_INVALID'
      : 'MODULE_INIT_FAILED';
    return res.status(503).json({ok:false,databaseConfigured,pepperConfigured,kind});
  }
}
