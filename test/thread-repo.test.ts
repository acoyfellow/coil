import { describe, expect, it, vi } from 'vitest';
import { capabilityNamed } from '../src/capabilities';
import type { Coil } from '../src/service';

const runCap = (name: string, api: Coil, args: Record<string, unknown>) => {
  const capability = capabilityNamed(name);

  if (!capability) throw new Error(`${name} missing`);

  return capability.run(api, args) as Promise<unknown>;
};

describe('thread_repo', () => {
  it('is in the capability list and needs a name and a repo', () => {
    const capability = capabilityNamed('thread_repo');

    expect(capability?.group).toBe('threads');
    expect(capability?.required).toEqual(['name', 'repo']);
  });

  it('clones a repo into an existing thread', async () => {
    const api = {
      attachRepo: vi.fn(async (name: string, repo: string) => ({
        repo,
        path: '/workspace',
        cloned: true,
      })),
    } as unknown as Coil;
    const output = (await runCap('thread_repo', api, {
      name: 'demo',
      repo: 'https://github.com/owner/repo',
    })) as { repo: string; path: string; cloned: boolean };

    expect(api.attachRepo).toHaveBeenCalledWith('demo', 'https://github.com/owner/repo');
    expect(output).toEqual({
      repo: 'https://github.com/owner/repo',
      path: '/workspace',
      cloned: true,
    });
  });

  it('rejects an empty repo', async () => {
    const api = { attachRepo: vi.fn() } as unknown as Coil;

    expect(() => runCap('thread_repo', api, { name: 'demo', repo: '' })).toThrowError(
      'repo is required',
    );
  });
});
