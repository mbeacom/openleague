import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeMicrosoftIdentityAssociation } from '@/scripts/build-docs-pages';

describe('Microsoft identity association file', () => {
  let dir: string | undefined;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('is written at .well-known/microsoft-identity-association.json with the planner app id', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'docs-pages-'));
    const file = await writeMicrosoftIdentityAssociation(dir);

    expect(path.relative(dir, file)).toBe(path.join('.well-known', 'microsoft-identity-association.json'));
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({
      associatedApplications: [{ applicationId: '91f29b89-9f2c-4210-93e2-c69502692bdd' }],
    });
  });
});
