export class OpenRouterAdapter {
  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY || '';
    this.baseURL = 'https://openrouter.ai/api/v1';
    this.models = [
      { id: 'meta-llama/llama-4-maverick', name: 'Llama 4 Maverick', input_cost_per_1k: 0.0002, output_cost_per_1k: 0.0006 },
      { id: 'meta-llama/llama-4-scout', name: 'Llama 4 Scout', input_cost_per_1k: 0.00008, output_cost_per_1k: 0.0003 },
      { id: 'mistralai/mistral-large-2411', name: 'Mistral Large', input_cost_per_1k: 0.002, output_cost_per_1k: 0.006 },
      { id: 'qwen/qwen-2.5-72b-instruct', name: 'Qwen 2.5 72B', input_cost_per_1k: 0.00035, output_cost_per_1k: 0.0004 },
      { id: 'deepseek/deepseek-chat-v3-0324', name: 'DeepSeek V3', input_cost_per_1k: 0.00014, output_cost_per_1k: 0.00028 },
    ];
  }

  isConfigured() { return !!this.apiKey; }
  getModels() { return this.models; }

  async getRateLimits() {
    if (!this.isConfigured()) return { configured: false };
    try {
      const res = await fetch(`${this.baseURL}/auth/key`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      const data = await res.json();
      return {
        configured: true,
        rpm_remaining: data.data?.rate_limit?.requests_remaining || null,
        rpm_limit: data.data?.rate_limit?.requests_limit || null,
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
