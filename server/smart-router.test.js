import { describe, it, expect, vi } from 'vitest';
import { SmartRouter } from './smart-router.js';

/**
 * Fake db exposing only `.prepare(sql).all()`, matching the sql.js wrapper's
 * shape (server/db/database.js). Returns whatever rows the test configures,
 * regardless of the SQL text — this is a unit test of the scoring logic in
 * SmartRouter.recommend(), not of the SQL query itself.
 */
function makeFakeDb(rows) {
  return {
    prepare: vi.fn(() => ({
      all: vi.fn(() => rows),
    })),
  };
}

describe('SmartRouter.recommend', () => {
  it('returns "no recommendation yet" honestly when there is no usage data', () => {
    const router = new SmartRouter(makeFakeDb([]), null);

    const result = router.recommend('cost-sensitive');

    expect(result.recommendation).toBeNull();
    expect(result.alternatives).toEqual([]);
    expect(result.message).toMatch(/No usage data/i);
  });

  it('picks the cheapest provider for a cost-sensitive task', () => {
    const rows = [
      { provider: 'openai', model: 'gpt-4o', cost_per_token: 0.00003, avg_latency: 800, usage_count: 20 },
      { provider: 'anthropic', model: 'claude-haiku', cost_per_token: 0.000002, avg_latency: 1200, usage_count: 20 },
    ];
    const router = new SmartRouter(makeFakeDb(rows), null);

    const result = router.recommend('cost-sensitive');

    expect(result.recommendation.provider).toBe('anthropic');
    expect(result.recommendation.model).toBe('claude-haiku');
  });

  it('picks the fastest provider for a speed task', () => {
    const rows = [
      { provider: 'slow-provider', model: 'big-model', cost_per_token: 0.000001, avg_latency: 5000, usage_count: 20 },
      { provider: 'fast-provider', model: 'small-model', cost_per_token: 0.00005, avg_latency: 150, usage_count: 20 },
    ];
    const router = new SmartRouter(makeFakeDb(rows), null);

    const result = router.recommend('speed');

    expect(result.recommendation.provider).toBe('fast-provider');
  });

  it('favors familiarity (usage_count) for a quality task when cost/latency are similar', () => {
    const rows = [
      { provider: 'well-known', model: 'm1', cost_per_token: 0.00002, avg_latency: 1000, usage_count: 20 },
      { provider: 'barely-used', model: 'm2', cost_per_token: 0.00002, avg_latency: 1000, usage_count: 2 },
    ];
    const router = new SmartRouter(makeFakeDb(rows), null);

    const result = router.recommend('quality');

    expect(result.recommendation.provider).toBe('well-known');
  });

  it('sorts alternatives below the top recommendation, best-first, capped at 3', () => {
    const rows = [
      { provider: 'p1', model: 'm1', cost_per_token: 0.000001, avg_latency: 100, usage_count: 20 }, // best
      { provider: 'p2', model: 'm2', cost_per_token: 0.00002, avg_latency: 500, usage_count: 20 },
      { provider: 'p3', model: 'm3', cost_per_token: 0.00003, avg_latency: 800, usage_count: 20 },
      { provider: 'p4', model: 'm4', cost_per_token: 0.00004, avg_latency: 1000, usage_count: 20 },
      { provider: 'p5', model: 'm5', cost_per_token: 0.00005, avg_latency: 1200, usage_count: 20 },
    ];
    const router = new SmartRouter(makeFakeDb(rows), null);

    const result = router.recommend('cost-sensitive');

    expect(result.recommendation.provider).toBe('p1');
    expect(result.alternatives).toHaveLength(3);
    // alternatives must be in descending score order and exclude the winner
    const scores = result.alternatives.map(a => a.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(result.alternatives.some(a => a.provider === 'p1')).toBe(false);
  });

  it('handles zero cost_per_token / zero latency without dividing by zero (treated as perfect score)', () => {
    const rows = [
      { provider: 'free-local', model: 'local-model', cost_per_token: 0, avg_latency: 0, usage_count: 20 },
    ];
    const router = new SmartRouter(makeFakeDb(rows), null);

    const result = router.recommend('cost-sensitive');

    expect(result.recommendation.provider).toBe('free-local');
    expect(Number.isFinite(result.recommendation.score)).toBe(true);
  });

  it('falls back to the default (balanced) scoring for an unrecognized task type', () => {
    const rows = [
      { provider: 'cheap-fast', model: 'm1', cost_per_token: 0.000001, avg_latency: 100, usage_count: 20 },
      { provider: 'pricey-slow', model: 'm2', cost_per_token: 0.001, avg_latency: 5000, usage_count: 1 },
    ];
    const router = new SmartRouter(makeFakeDb(rows), null);

    const result = router.recommend('some-unknown-task-type');

    expect(result.recommendation.provider).toBe('cheap-fast');
  });
});
