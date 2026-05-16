import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQueryRaw } = vi.hoisted(() => ({
  mockQueryRaw: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $queryRaw: mockQueryRaw,
  },
}));

import { GET } from '@/app/api/health/route';

const HEALTH_TOKEN = 'abcdefghijklmnopqrstuvwxyz123456';

function makeRequest(token?: string): Request {
  return new Request('https://openl.app/api/health', {
    method: 'GET',
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
}

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.UPTIME_CHECK_TOKEN = HEALTH_TOKEN;
    mockQueryRaw.mockResolvedValue([{ '?column?': 1 }]);
  });

  it('returns 503 when the health token is not configured', async () => {
    delete process.env.UPTIME_CHECK_TOKEN;

    const response = await GET(makeRequest(HEALTH_TOKEN));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({ status: 'unavailable' });
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });

  it('returns 401 when the bearer token is missing', async () => {
    const response = await GET(makeRequest());

    expect(response.status).toBe(401);
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });

  it('returns 401 when the bearer token is invalid', async () => {
    const response = await GET(makeRequest('wrong-token'));

    expect(response.status).toBe(401);
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });

  it('returns 200 after validating the token and database readiness', async () => {
    const response = await GET(makeRequest(HEALTH_TOKEN));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(body).toMatchObject({
      status: 'ok',
      checks: {
        database: { ok: true },
      },
    });
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
  });

  it('returns 503 when database readiness fails', async () => {
    mockQueryRaw.mockRejectedValue(new Error('database offline'));

    const response = await GET(makeRequest(HEALTH_TOKEN));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      status: 'degraded',
      checks: {
        database: { ok: false, error: 'database_unavailable' },
      },
    });
  });
});