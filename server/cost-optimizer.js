export class CostOptimizer {
  constructor(db) {
    this.db = db;
  }

  getSuggestions() {
    const modelUsage = this.db.prepare(`
      SELECT provider, model,
        AVG(cost_usd / NULLIF(input_tokens + output_tokens, 0)) as cost_per_token,
        AVG(latency_ms) as avg_latency,
        COUNT(*) as usage_count,
        SUM(cost_usd) as total_cost
      FROM usage_events
      WHERE timestamp > datetime('now', '-30 days')
      GROUP BY provider, model
      HAVING usage_count >= 3
      ORDER BY total_cost DESC
    `).all();

    const suggestions = [];

    for (const usage of modelUsage) {
      const cheaper = modelUsage.find(m =>
        m.provider === usage.provider &&
        m.model !== usage.model &&
        m.cost_per_token < usage.cost_per_token * 0.7 &&
        m.avg_latency < usage.avg_latency * 1.5
      );

      if (cheaper) {
        const savingsPerToken = usage.cost_per_token - cheaper.cost_per_token;
        const estimatedMonthlySavings = savingsPerToken * (usage.total_cost / usage.cost_per_token);
        suggestions.push({
          type: 'cheaper_model',
          current: { provider: usage.provider, model: usage.model },
          alternative: { provider: cheaper.provider, model: cheaper.model },
          estimated_savings: estimatedMonthlySavings,
          message: `Switch from ${usage.model} to ${cheaper.model} to save ~$${estimatedMonthlySavings.toFixed(2)}/month`,
        });
      }
    }

    const providerCosts = this.db.prepare(`
      SELECT provider,
        SUM(cost_usd) as total_cost,
        COUNT(*) as requests
      FROM usage_events
      WHERE timestamp > datetime('now', '-7 days')
      GROUP BY provider
      ORDER BY total_cost DESC
    `).all();

    if (providerCosts.length > 1) {
      const mostExpensive = providerCosts[0];
      const cheapest = providerCosts[providerCosts.length - 1];
      if (mostExpensive.total_cost > cheapest.total_cost * 3) {
        suggestions.push({
          type: 'provider_consolidation',
          message: `Consider routing more traffic to ${cheaper.provider} - it's ${((mostExpensive.total_cost / cheapest.total_cost)).toFixed(1)}x cheaper this week`,
          data: { expensive: mostExpensive, cheap: cheapest },
        });
      }
    }

    return suggestions;
  }
}
