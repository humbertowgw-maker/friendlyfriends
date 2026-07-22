export class SmartRouter {
  constructor(db, optimizer) {
    this.db = db;
    this.optimizer = optimizer;
  }

  recommend(taskType) {
    const modelPerformance = this.db.prepare(`
      SELECT
        provider, model,
        AVG(cost_usd / NULLIF(input_tokens + output_tokens, 0)) as cost_per_token,
        AVG(latency_ms) as avg_latency,
        COUNT(*) as usage_count
      FROM usage_events
      WHERE timestamp > datetime('now', '-30 days')
      GROUP BY provider, model
      HAVING usage_count >= 2
    `).all();

    if (modelPerformance.length === 0) {
      return {
        task_type: taskType,
        recommendation: null,
        message: 'No usage data yet. Use models to build recommendations.',
        alternatives: [],
      };
    }

    const scored = modelPerformance.map(m => {
      let score = 0;
      const costScore = m.cost_per_token > 0
        ? 1 / (1 + m.cost_per_token * 10000)
        : 1;
      const latencyScore = m.avg_latency > 0
        ? 1 / (1 + m.avg_latency / 5000)
        : 1;
      const familiarityScore = Math.min(m.usage_count / 20, 1);

      switch (taskType) {
        case 'cost-sensitive':
          score = costScore * 0.7 + latencyScore * 0.1 + familiarityScore * 0.2;
          break;
        case 'speed':
          score = latencyScore * 0.7 + costScore * 0.1 + familiarityScore * 0.2;
          break;
        case 'quality':
          score = familiarityScore * 0.5 + latencyScore * 0.3 + costScore * 0.2;
          break;
        default:
          score = costScore * 0.4 + latencyScore * 0.3 + familiarityScore * 0.3;
      }

      return { ...m, score };
    }).sort((a, b) => b.score - a.score);

    const best = scored[0];
    return {
      task_type: taskType,
      recommendation: {
        provider: best.provider,
        model: best.model,
        score: best.score,
        cost_per_token: best.cost_per_token,
        avg_latency: best.avg_latency,
      },
      alternatives: scored.slice(1, 4).map(m => ({
        provider: m.provider,
        model: m.model,
        score: m.score,
        cost_per_token: m.cost_per_token,
        avg_latency: m.avg_latency,
      })),
    };
  }
}
