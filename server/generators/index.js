import { PollinationsAdapter } from './pollinations-adapter.js';
import { HuggingFaceAdapter } from './huggingface-adapter.js';
import { LocalSDAdapter } from './local-sd-adapter.js';
import { PromptBuilder } from './prompt-builder.js';

export class GeneratorManager {
  constructor() {
    this.adapters = [];
    this.history = [];
    this.maxHistory = 100;
  }

  /**
   * Register a generator adapter.
   */
  register(adapter) {
    this.adapters.push(adapter);
    this.adapters.sort((a, b) => a.priority - b.priority);
    return this;
  }

  /**
   * Get all registered adapters and their status.
   */
  async getStatus() {
    const statuses = [];
    for (const adapter of this.adapters) {
      statuses.push(await adapter.healthCheck());
    }
    return statuses;
  }

  /**
   * Generate an image using the first available adapter.
   * Falls through to the next adapter on failure.
   *
   * @param {object} params - { character_slug, action_label, asset_type, prompt }
   * @returns {Promise<{ asset_ref: string, metadata: object, generator: string }>}
   */
  async generate(params) {
    const enabledAdapters = this.adapters.filter(a => a.enabled && a.isConfigured());
    if (enabledAdapters.length === 0) {
      throw new Error('No image generators configured. Set SD_WEBUI_URL, COMFYUI_URL, or HF_API_TOKEN in .env');
    }

    // Build prompt if not provided
    if (!params.prompt && params.character_slug) {
      params.prompt = PromptBuilder.build(params.character_slug, params.action_label, params.asset_type || 'pose');
    }

    if (!params.prompt) {
      throw new Error('Could not build prompt: missing character_slug or prompt');
    }

    let lastError = null;
    for (const adapter of enabledAdapters) {
      try {
        const result = await adapter.generate({
          character_name: params.character_slug,
          character_description: PromptBuilder.getCharacterDescription(params.character_slug),
          action_label: params.action_label,
          asset_type: params.asset_type || 'pose',
          prompt: params.prompt,
        });

        const entry = {
          generator: adapter.name,
          character_slug: params.character_slug,
          action_label: params.action_label,
          asset_ref: result.asset_ref,
          timestamp: new Date().toISOString(),
        };
        this.history.push(entry);
        if (this.history.length > this.maxHistory) this.history.shift();

        return { ...result, generator: adapter.name };
      } catch (e) {
        lastError = e;
        // Try next adapter
      }
    }

    throw new Error(`All generators failed. Last error: ${lastError?.message}`);
  }

  /**
   * Get generation history.
   */
  getHistory(limit = 50) {
    return this.history.slice(-limit);
  }

  /**
   * Get stats about generation usage.
   */
  getStats() {
    const byGenerator = {};
    for (const entry of this.history) {
      byGenerator[entry.generator] = (byGenerator[entry.generator] || 0) + 1;
    }
    return { total: this.history.length, by_generator: byGenerator };
  }
}

/**
 * Create and configure the default GeneratorManager.
 */
export function createGenerators() {
  const manager = new GeneratorManager();

  // Priority order: local SD first (free, fast), then Pollinations (free, no key), then HuggingFace (free tier)
  manager.register(new LocalSDAdapter({ priority: 10 }));
  manager.register(new PollinationsAdapter({ priority: 50 }));
  manager.register(new HuggingFaceAdapter({ priority: 40 }));

  return manager;
}

export { PromptBuilder } from './prompt-builder.js';
