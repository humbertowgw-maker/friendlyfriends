export class OpenAIAdapter {
  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || '';
    this.baseURL = 'https://api.openai.com/v1';
    this.models = [
      { id: 'gpt-4.1', name: 'GPT-4.1', input_cost_per_1k: 0.002, output_cost_per_1k: 0.008 },
      { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', input_cost_per_1k: 0.0004, output_cost_per_1k: 0.0016 },
      { id: 'gpt-4o', name: 'GPT-4o', input_cost_per_1k: 0.0025, output_cost_per_1k: 0.01 },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', input_cost_per_1k: 0.00015, output_cost_per_1k: 0.0006 },
      { id: 'o3', name: 'o3', input_cost_per_1k: 0.01, output_cost_per_1k: 0.04 },
      { id: 'o3-mini', name: 'o3-mini', input_cost_per_1k: 0.0011, output_cost_per_1k: 0.0044 },
      { id: 'o4-mini', name: 'o4-mini', input_cost_per_1k: 0.0011, output_cost_per_1k: 0.0044 },
    ];
  }

  isConfigured() { return !!this.apiKey; }
  getModels() { return this.models; }

  async getRateLimits() {
    if (!this.isConfigured()) return { configured: false };
    try {
      const res = await fetch(`${this.baseURL}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      const remaining = res.headers.get('x-ratelimit-remaining-requests');
      const limit = res.headers.get('x-ratelimit-limit-requests');
      const reset = res.headers.get('x-ratelimit-reset-requests');
      return {
        configured: true,
        rpm_remaining: remaining ? parseInt(remaining) : null,
        rpm_limit: limit ? parseInt(limit) : null,
        reset_seconds: reset ? parseInt(reset) : null,
        tpm_remaining: null,
        tpm_limit: null,
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
