import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const noStoreHeaders = {
  'Cache-Control': 'no-store, max-age=0',
};

function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  const match = /^Bearer\s+(.+)$/iu.exec(authHeader ?? '');
  return match?.[1]?.trim() || null;
}

function isTokenValid(providedToken: string | null, expectedToken: string): boolean {
  if (!providedToken) {
    return false;
  }

  const expected = Buffer.from(expectedToken);
  const actual = Buffer.from(providedToken);

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function checkDatabase() {
  const startedAt = Date.now();

  try {
    const { prisma } = await import('@/lib/db/prisma');
    await prisma.$queryRaw`SELECT 1`;

    return {
      ok: true,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    console.error('Health check database ping failed:', error);

    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: 'database_unavailable',
    };
  }
}

export async function GET(request: Request) {
  const expectedToken = process.env.UPTIME_CHECK_TOKEN?.trim();

  if (!expectedToken) {
    return NextResponse.json(
      {
        status: 'unavailable',
        error: 'Health check token is not configured',
        timestamp: new Date().toISOString(),
      },
      { status: 503, headers: noStoreHeaders },
    );
  }

  if (!isTokenValid(extractBearerToken(request), expectedToken)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: noStoreHeaders },
    );
  }

  const database = await checkDatabase();
  const status = database.ok ? 'ok' : 'degraded';

  return NextResponse.json(
    {
      status,
      timestamp: new Date().toISOString(),
      checks: {
        database,
      },
    },
    { status: database.ok ? 200 : 503, headers: noStoreHeaders },
  );
}