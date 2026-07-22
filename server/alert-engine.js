export class AlertEngine {
  constructor(db, broadcast) {
    this.db = db;
    this.broadcast = broadcast;
  }

  checkThresholds(provider, model, data) {
    const rules = this.db.prepare(`
      SELECT * FROM alert_rules
      WHERE enabled = 1 AND (provider = ? OR provider = '*')
    `).all(provider);

    for (const rule of rules) {
      let value = 0;
      switch (rule.metric) {
        case 'cost_usd': value = data.cost_usd || 0; break;
        case 'tokens': value = (data.input_tokens || 0) + (data.output_tokens || 0); break;
        case 'daily_cost': {
          const row = this.db.prepare(`
            SELECT SUM(cost_usd) as total FROM usage_events
            WHERE provider = ? AND date(timestamp) = date('now')
          `).get(provider);
          value = (row?.total || 0) + (data.cost_usd || 0);
          break;
        }
        case 'daily_tokens': {
          const row = this.db.prepare(`
            SELECT SUM(input_tokens + output_tokens) as total FROM usage_events
            WHERE provider = ? AND date(timestamp) = date('now')
          `).get(provider);
          value = (row?.total || 0) + ((data.input_tokens || 0) + (data.output_tokens || 0));
          break;
        }
      }

      if (value > rule.threshold) {
        this.fire(rule, provider, value);
      }
    }
  }

  checkRateLimits(provider, limits) {
    if (!limits.rpm_remaining || !limits.rpm_limit) return;

    const usagePercent = (1 - limits.rpm_remaining / limits.rpm_limit) * 100;

    if (usagePercent > 90) {
      this.fire({
        id: null,
        metric: 'rpm_usage',
        threshold: 90,
        type: 'critical',
      }, provider, usagePercent, `CRITICAL: ${provider} at ${usagePercent.toFixed(0)}% RPM usage (${limits.rpm_remaining}/${limits.rpm_limit} remaining)`);
    } else if (usagePercent > 75) {
      this.fire({
        id: null,
        metric: 'rpm_usage',
        threshold: 75,
        type: 'warning',
      }, provider, usagePercent, `WARNING: ${provider} at ${usagePercent.toFixed(0)}% RPM usage`);
    }
  }

  fire(rule, provider, value, customMessage) {
    const message = customMessage || `${rule.metric} exceeded threshold: ${value} > ${rule.threshold}`;

    this.db.prepare(`
      INSERT INTO alert_events (rule_id, provider, metric, value, threshold, message)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(rule.id, provider, rule.metric, value, rule.threshold, message);

    const alert = {
      provider,
      metric: rule.metric,
      value,
      threshold: rule.threshold,
      type: rule.type,
      message,
      timestamp: new Date().toISOString(),
    };

    this.broadcast('alert', alert);

    if (typeof Notification !== 'undefined') return;
    if (typeof globalThis !== 'undefined' && globalThis.alert) {
      globalThis.alert(message);
    }
  }
}
