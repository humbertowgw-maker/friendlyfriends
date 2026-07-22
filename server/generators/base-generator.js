export class BaseGenerator {
  constructor(name, options = {}) {
    this.name = name;
    this.priority = options.priority || 100;
    this.enabled = options.enabled !== false;
  }

  isConfigured() { return false; }

  /**
   * Generate an image asset.
   * @param {object} params
   * @param {string} params.character_name - e.g. "Achilles"
   * @param {string} params.character_description - e.g. "Tan, ~60 lbs, blind service dog"
   * @param {string} params.action_label - e.g. "sitting", "waving"
   * @param {string} params.asset_type - e.g. "pose", "movement_cycle", "expression"
   * @param {object} params.metadata - extra context (scene, episode, etc.)
   * @returns {Promise<{ asset_ref: string, metadata: object }>}
   */
  async generate(params) {
    throw new Error(`${this.name}: generate() not implemented`);
  }

  /**
   * Check if this generator is healthy / available.
   */
  async healthCheck() {
    return { name: this.name, status: this.isConfigured() ? 'configured' : 'not_configured' };
  }
}
