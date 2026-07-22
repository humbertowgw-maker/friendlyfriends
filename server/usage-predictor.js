export class UsagePredictor {
  constructor(db) {
    this.db = db;
  }

  predict() {
    const hourlyUsage = this.db.prepare(`
      SELECT
        strftime('%H', timestamp) as hour,
        AVG(input_tokens + output_tokens) as avg_tokens,
        AVG(cost_usd) as avg_cost,
        COUNT(*) as avg_requests
      FROM usage_events
      WHERE timestamp > datetime('now', '-14 days')
      GROUP BY hour
      ORDER BY hour
    `).all();

    const dailyUsage = this.db.prepare(`
      SELECT
        date(timestamp) as day,
        SUM(input_tokens + output_tokens) as tokens,
        SUM(cost_usd) as cost,
        COUNT(*) as requests
      FROM usage_events
      WHERE timestamp > datetime('now', '-14 days')
      GROUP BY day
      ORDER BY day
    `).all();

    const predictions = [];

    if (dailyUsage.length >= 3) {
      const costs = dailyUsage.map(d => d.cost);
      const avgDailyCost = costs.reduce((a, b) => a + b, 0) / costs.length;
      const trend = costs.length >= 2
        ? (costs[costs.length - 1] - costs[0]) / costs.length
        : 0;

      predictions.push({
        metric: 'daily_cost',
        current_avg: avgDailyCost,
        trend_per_day: trend,
        predicted_monthly: avgDailyCost * 30 + trend * 30 * 15,
        confidence: dailyUsage.length >= 7 ? 'high' : 'medium',
      });
    }

    if (hourlyUsage.length > 0) {
      const peakHour = hourlyUsage.reduce((max, h) =>
        h.avg_tokens > max.avg_tokens ? h : max
      );
      const offPeakHour = hourlyUsage.reduce((min, h) =>
        h.avg_tokens < min.avg_tokens ? h : min
      );

      predictions.push({
        metric: 'peak_usage',
        peak_hour: peakHour.hour,
        peak_avg_tokens: peakHour.avg_tokens,
        offpeak_hour: offPeakHour.hour,
        offpeak_avg_tokens: offPeakHour.avg_tokens,
      });
    }

    const recentTokens = this.db.prepare(`
      SELECT SUM(input_tokens + output_tokens) as total
      FROM usage_events
      WHERE timestamp > datetime('now', '-1 day')
    `).get();

    if (recentTokens?.total > 0 && hourlyUsage.length > 0) {
      const avgHourly = hourlyUsage.reduce((a, h) => a + h.avg_tokens, 0) / hourlyUsage.length;
      const hoursUntilExhaustion = avgHourly > 0 ? (recentTokens.total / avgHourly) : null;

      predictions.push({
        metric: 'rate_limit_risk',
        daily_tokens: recentTokens.total,
        avg_hourly_tokens: avgHourly,
        estimated_hours_to_deplete: hoursUntilExhaustion,
        risk_level: hoursUntilExhaustion && hoursUntilExhaustion < 20 ? 'high' : 'low',
      });
    }

    return predictions;
  }
}
