// MongoDB ulanish tekshiruvi: GET /api/mongo-health
// Faqat ulanish holatini qaytaradi (parol/URI hech qachon ko‘rsatilmaydi).
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const headers = { 'Cache-Control': 'no-store' };
  if (!process.env.MONGODB_URI) {
    return Response.json({ ok: false, configured: false, error: 'MONGODB_URI sozlanmagan' }, { status: 503, headers });
  }
  try {
    const { checkMongoConnection } = await import('../../../lib/mongodb.js');
    const result = await checkMongoConnection();
    return Response.json(
      {
        ...result,
        configured: true,
        ...(result.transactionsSupported
          ? {}
          : {
              error:
                'MongoDB replica set or mongos is required for transactional checkout. Use MongoDB Atlas or configure a local replica set.',
            }),
      },
      { status: result.ok ? 200 : 503, headers },
    );
  } catch {
    return Response.json({ ok: false, configured: true, error: 'MongoDB ga ulanib bo‘lmadi (URI, parol va Atlas Network Access 0.0.0.0/0 ni tekshiring)' }, { status: 503, headers });
  }
}
