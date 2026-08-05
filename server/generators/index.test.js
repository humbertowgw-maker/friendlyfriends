import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeneratorManager } from './index.js';

/**
 * Minimal fake adapter satisfying the surface GeneratorManager relies on:
 * enabled, isConfigured(), priority, name, generate(). This avoids pulling in
 * real network calls from Pollinations/HuggingFace/LocalSD adapters.
 */
function makeAdapter({ name, priority, configured = true, enabled = true, fail = false }) {
  return {
    name,
    priority,
    enabled,
    isConfigured: () => configured,
    generate: vi.fn(async (params) => {
      if (fail) throw new Error(`${name} failed`);
      return { asset_ref: `assets/${name}.png`, metadata: { generator: name } };
    }),
  };
}

describe('GeneratorManager', () => {
  let manager;

  beforeEach(() => {
    manager = new GeneratorManager();
  });

  it('registers adapters sorted by ascending priority regardless of registration order', () => {
    const low = makeAdapter({ name: 'low-priority', priority: 50 });
    const high = makeAdapter({ name: 'high-priority', priority: 10 });
    const mid = makeAdapter({ name: 'mid-priority', priority: 30 });

    manager.register(low).register(high).register(mid);

    expect(manager.adapters.map(a => a.name)).toEqual([
      'high-priority', 'mid-priority', 'low-priority',
    ]);
  });

  it('uses the highest-priority (lowest number) enabled+configured adapter first', async () => {
    const primary = makeAdapter({ name: 'primary', priority: 10 });
    const secondary = makeAdapter({ name: 'secondary', priority: 50 });
    manager.register(secondary).register(primary);

    const result = await manager.generate({ prompt: 'a cat waving' });

    expect(result.generator).toBe('primary');
    expect(primary.generate).toHaveBeenCalledTimes(1);
    expect(secondary.generate).not.toHaveBeenCalled();
  });

  it('falls back to the next adapter in priority order when the first fails', async () => {
    const primary = makeAdapter({ name: 'primary', priority: 10, fail: true });
    const secondary = makeAdapter({ name: 'secondary', priority: 50 });
    manager.register(primary).register(secondary);

    const result = await manager.generate({ prompt: 'a cat waving' });

    expect(result.generator).toBe('secondary');
    expect(primary.generate).toHaveBeenCalledTimes(1);
    expect(secondary.generate).toHaveBeenCalledTimes(1);
  });

  it('falls through multiple failures to the last surviving adapter, in priority order', async () => {
    const first = makeAdapter({ name: 'first', priority: 10, fail: true });
    const second = makeAdapter({ name: 'second', priority: 20, fail: true });
    const third = makeAdapter({ name: 'third', priority: 30 });
    // Register out of priority order to prove sort ordering drives fallback order, not registration order.
    manager.register(third).register(first).register(second);

    const result = await manager.generate({ prompt: 'a cat waving' });

    expect(result.generator).toBe('third');
    expect(first.generate).toHaveBeenCalledTimes(1);
    expect(second.generate).toHaveBeenCalledTimes(1);
    expect(third.generate).toHaveBeenCalledTimes(1);
  });

  it('skips adapters that are not configured, even if higher priority', async () => {
    const unconfigured = makeAdapter({ name: 'unconfigured', priority: 5, configured: false });
    const configured = makeAdapter({ name: 'configured', priority: 20 });
    manager.register(unconfigured).register(configured);

    const result = await manager.generate({ prompt: 'a cat waving' });

    expect(result.generator).toBe('configured');
    expect(unconfigured.generate).not.toHaveBeenCalled();
  });

  it('skips disabled adapters', async () => {
    const disabled = makeAdapter({ name: 'disabled', priority: 5, enabled: false });
    const enabled = makeAdapter({ name: 'enabled', priority: 20 });
    manager.register(disabled).register(enabled);

    const result = await manager.generate({ prompt: 'a cat waving' });

    expect(result.generator).toBe('enabled');
    expect(disabled.generate).not.toHaveBeenCalled();
  });

  it('throws with the last error message when every configured adapter fails', async () => {
    const a = makeAdapter({ name: 'a', priority: 10, fail: true });
    const b = makeAdapter({ name: 'b', priority: 20, fail: true });
    manager.register(a).register(b);

    await expect(manager.generate({ prompt: 'a cat waving' }))
      .rejects.toThrow(/All generators failed.*b failed/);
  });

  it('throws when no adapters are configured at all', async () => {
    const unconfigured = makeAdapter({ name: 'unconfigured', priority: 10, configured: false });
    manager.register(unconfigured);

    await expect(manager.generate({ prompt: 'a cat waving' }))
      .rejects.toThrow(/No image generators configured/);
  });

  it('records a history entry only for the adapter that actually succeeded', async () => {
    const primary = makeAdapter({ name: 'primary', priority: 10, fail: true });
    const secondary = makeAdapter({ name: 'secondary', priority: 50 });
    manager.register(primary).register(secondary);

    await manager.generate({ prompt: 'a cat waving' });

    expect(manager.getHistory()).toHaveLength(1);
    expect(manager.getHistory()[0].generator).toBe('secondary');
  });
});
