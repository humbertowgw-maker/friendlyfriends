export class AnthropicAdapter {
  constructor() {
    this.apiKey = process.env.ANTHROPIC_API_KEY || '';
    this.baseURL = 'https://api.anthropic.com/v1';
    this.models = [
      { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', input_cost_per_1k: 0.015, output_cost_per_1k: 0.075 },
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', input_cost_per_1k: 0.003, output_cost_per_1k: 0.015 },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', input_cost_per_1k: 0.0008, output_cost_per_1k: 0.004 },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', input_cost_per_1k: 0.003, output_cost_per_1k: 0.015 },
    ];
  }

  isConfigured() { return !!this.apiKey; }
  getModels() { return this.models; }

  async getRateLimits() {
    if (!this.isConfigured()) return { configured: false };
    try {
      const res = await fetch(`${this.baseURL}/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model: 'claude-3-5-haiku-20241022', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
      });
      const remaining = res.headers.get('anthropic-ratelimit-requests-remaining');
      const limit = res.headers.get('anthropic-ratelimit-requests-limit');
      const tpmRemaining = res.headers.get('anthropic-ratelimit-tokens-remaining');
      const tpmLimit = res.headers.get('anthropic-ratelimit-tokens-limit');
      return {
        configured: true,
        rpm_remaining: remaining ? parseInt(remaining) : null,
        rpm_limit: limit ? parseInt(limit) : null,
        tpm_remaining: tpmRemaining ? parseInt(tpmRemaining) : null,
        tpm_limit: tpmLimit ? parseInt(tpmLimit) : null,
      };
    } catch (e) {
      return { configured: true, error: e.message };
    }
  }

  calculateCost(model, inputTokens, outputTokens) {
    const m = this.models.find(x => x.id === model);
    if (!m) return 0;
    return (inputTokens / 1000) * m.input_cost_per_1k + (outputTokens / 1000) * m.output_cost_per_1k;
  }
}
