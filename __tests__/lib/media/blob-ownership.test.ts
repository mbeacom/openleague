import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { entityLogoPrefix, isBrandableEntity, isOwnedBlobUrl, ownedBlobHost } from '@/lib/media/blob';

const PREFIX = entityLogoPrefix('team', 'team-1');
// A fake token for a store with a mixed-case id: hostnames compare lowercased.
const TOKEN = 'vercel_blob_rw_Abc123_notARealSecret';
const HOST = 'abc123.public.blob.vercel-storage.com';
const OWNED = `https://${HOST}/${PREFIX}crest-x1y2.png`;

beforeEach(() => {
  vi.stubEnv('BLOB_READ_WRITE_TOKEN', TOKEN);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('ownedBlobHost', () => {
  it("derives the store's public host from the read-write token", () => {
    expect(ownedBlobHost()).toBe(HOST);
    expect(ownedBlobHost(`  ${TOKEN}  `)).toBe(HOST);
  });

  it.each([
    ['an empty token', ''],
    ['a blank token', '   '],
    ['another kind of token', 'vercel_blob_client_Abc123_secret'],
    ['a token without a store id', 'vercel_blob_rw__secret'],
    ['a store id with a dot', 'vercel_blob_rw_abc.evil_secret'],
    ['a store id with a slash', 'vercel_blob_rw_abc/x_secret'],
  ])('is null for %s', (_label, token) => {
    expect(ownedBlobHost(token)).toBeNull();
  });

  it('is null when no token is configured', () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', undefined);
    expect(ownedBlobHost()).toBeNull();
  });
});

describe('isOwnedBlobUrl', () => {
  it('accepts one of our blobs under the entity prefix', () => {
    expect(isOwnedBlobUrl(OWNED, PREFIX)).toBe(true);
  });

  it('rejects a third-party host', () => {
    // The client hands us this URL, so an unchecked write would let an admin
    // point a crest at any host — a tracking pixel on every page the team
    // appears on.
    expect(
      isOwnedBlobUrl('https://evil.example.com/branding/team/team-1/crest.png', PREFIX),
    ).toBe(false);
  });

  it('rejects a host that merely ends with the blob domain as a suffix string', () => {
    expect(
      isOwnedBlobUrl(`https://notblob.vercel-storage.com.evil.com/${PREFIX}x.png`, PREFIX),
    ).toBe(false);
  });

  it("rejects another entity's object on our own storage", () => {
    // Otherwise one admin could adopt another team's object and a later
    // replace would delete a file they never owned.
    expect(
      isOwnedBlobUrl(
        'https://abc123.public.blob.vercel-storage.com/branding/team/team-2/crest.png',
        PREFIX,
      ),
    ).toBe(false);
  });

  it('rejects a path that only contains the prefix later on', () => {
    expect(
      isOwnedBlobUrl(
        `https://abc123.public.blob.vercel-storage.com/elsewhere/${PREFIX}crest.png`,
        PREFIX,
      ),
    ).toBe(false);
  });

  it('rejects non-https schemes', () => {
    expect(isOwnedBlobUrl(OWNED.replace('https:', 'http:'), PREFIX)).toBe(false);
  });

  it('rejects a malformed URL instead of throwing', () => {
    expect(isOwnedBlobUrl('not a url', PREFIX)).toBe(false);
  });

  it.each([
    ['another store', `https://other1.public.blob.vercel-storage.com/${PREFIX}x.png`],
    ['a host with our store as a suffix', `https://x${HOST}/${PREFIX}x.png`],
    ['a host with our store as a prefix', `https://${HOST}.evil.com/${PREFIX}x.png`],
    ['a subdomain of our store', `https://a.${HOST}/${PREFIX}x.png`],
    ['an explicit port', `https://${HOST}:8443/${PREFIX}x.png`],
    ['the store id on another access level', `https://abc123.private.blob.vercel-storage.com/${PREFIX}x.png`],
  ])('rejects %s', (_label, url) => {
    expect(isOwnedBlobUrl(url, PREFIX)).toBe(false);
  });

  it('accepts our store whatever the case of the URL host', () => {
    expect(isOwnedBlobUrl(`https://ABC123.public.blob.vercel-storage.com/${PREFIX}x.png`, PREFIX)).toBe(true);
  });

  it.each([
    ['no token is configured', undefined],
    ['the token is malformed', 'not-a-blob-token'],
  ])('owns nothing when %s', (_label, token) => {
    if (token === undefined) vi.stubEnv('BLOB_READ_WRITE_TOKEN', undefined);
    else vi.stubEnv('BLOB_READ_WRITE_TOKEN', token);
    expect(isOwnedBlobUrl(OWNED, PREFIX)).toBe(false);
  });
});

describe('entityLogoPrefix', () => {
  it('scopes uploads per entity kind and id', () => {
    expect(entityLogoPrefix('league', 'lg-9')).toBe('branding/league/lg-9/');
    expect(entityLogoPrefix('venue', 'vn-9')).toBe('branding/venue/vn-9/');
  });
});

describe('isBrandableEntity', () => {
  it.each(['team', 'league', 'venue'])('accepts %s', (value) => {
    expect(isBrandableEntity(value)).toBe(true);
  });

  it.each(['user', 'player', '../league', ''])('rejects %p', (value) => {
    expect(isBrandableEntity(value)).toBe(false);
  });
});
