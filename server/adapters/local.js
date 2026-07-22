export class LocalAdapter {
  constructor(name, baseURL) {
    this.name = name;
    this.baseURL = baseURL;
    this.models = [
      { id: 'local-default', name: `${name} Default`, input_cost_per_1k: 0, output_cost_per_1k: 0 },
    ];
  }

  isConfigured() { return true; }
  getModels() { return this.models; }

  async getRateLimits() {
    try {
      const res = await fetch(`${this.baseURL}/v1/models`);
      if (!res.ok) return { configured: false };
      return {
        configured: true,
        rpm_remaining: null,
        rpm_limit: null,
        tpm_remaining: null,
        tpm_limit: null,
        note: 'Local model - no rate limits',
      };
    } catch {
      return { configured: false };
    }
  }

  calculateCost() { return 0; }
}
