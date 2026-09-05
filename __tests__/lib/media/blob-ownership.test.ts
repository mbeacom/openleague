import { describe, it, expect } from 'vitest';
import { entityLogoPrefix, isBrandableEntity, isOwnedBlobUrl } from '@/lib/media/blob';

const PREFIX = entityLogoPrefix('team', 'team-1');
const OWNED = `https://abc123.public.blob.vercel-storage.com/${PREFIX}crest-x1y2.png`;

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
