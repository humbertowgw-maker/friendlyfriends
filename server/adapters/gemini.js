export class GeminiAdapter {
  constructor() {
    this.apiKey = process.env.GOOGLE_GEMINI_API_KEY || '';
    this.baseURL = 'https://generativelanguage.googleapis.com/v1beta';
    this.models = [
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', input_cost_per_1k: 0.00125, output_cost_per_1k: 0.01 },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', input_cost_per_1k: 0.00015, output_cost_per_1k: 0.0006 },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', input_cost_per_1k: 0.0001, output_cost_per_1k: 0.0004 },
    ];
  }

  isConfigured() { return !!this.apiKey; }
  getModels() { return this.models; }

  async getRateLimits() {
    if (!this.isConfigured()) return { configured: false };
    try {
      const res = await fetch(`${this.baseURL}/models?key=${this.apiKey}`);
      return {
        configured: true,
        rpm_remaining: null,
        rpm_limit: null,
        tpm_remaining: null,
        tpm_limit: null,
        note: 'Google returns rate limits per-model in 429 responses',
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
