import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, writeFileSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, '..', 'data', 'assets');

export class PipelineHook {
  constructor(inventory) {
    this.inventory = inventory;
    try { mkdirSync(ASSETS_DIR, { recursive: true }); } catch {}
  }

  /**
   * Core pipeline integration point.
   * Call this whenever the video pipeline needs an animation asset.
   *
   * @param {number} characterId
   * @param {string} label - e.g. "waving", "sitting", "excited_bark"
   * @param {string} type - asset type: pose, movement_cycle, expression, voice_line, background_interaction
   * @param {Function} generateFn - async function that generates the asset and returns { asset_ref, metadata }
   * @returns {{ asset, reused: boolean }}
   */
  async resolveAsset(characterId, label, type, generateFn) {
    const existing = this.inventory.lookupAsset(characterId, label, type);

    if (existing) {
      const updated = this.inventory.incrementAssetUse(existing.id);
      return { asset: updated, reused: true };
    }

    // Not found — generate it
    const generated = await generateFn();
    const asset = this.inventory.createAsset(characterId, {
      type,
      label,
      asset_ref: generated.asset_ref,
      metadata: generated.metadata || {},
      source: 'generated',
    });

    // Auto-resolve any matching pending gaps
    const gaps = this.inventory.getGaps({ status: 'pending', character_id: characterId });
    for (const gap of gaps) {
      if (gap.requested_label === label && gap.asset_type === type) {
        this.inventory.resolveGap(gap.id);
      }
    }

    return { asset, reused: false };
  }

  /**
   * Batch resolve: given an array of { characterId, label, type, generateFn },
   * resolve all assets, reusing what exists and generating what's missing.
   */
  async resolveAssets(requests) {
    const results = [];
    for (const req of requests) {
      const result = await this.resolveAsset(req.characterId, req.label, req.type, req.generateFn);
      results.push({ ...result, characterId: req.characterId, label: req.label, type: req.type });
    }
    return results;
  }

  /**
   * Placeholder asset generator — in a real pipeline, this would call
   * the animation/video generation service. Here it creates a stub file
   * so the inventory has something to reference.
   */
  static stubGenerator(label, type) {
    return async () => {
      const filename = `${type}-${label.replace(/\s+/g, '_')}-${Date.now()}.stub`;
      const filePath = join(ASSETS_DIR, filename);
      if (!existsSync(filePath)) {
        writeFileSync(filePath, `stub asset for ${type}: ${label}`);
      }
      return {
        asset_ref: `assets/${filename}`,
        metadata: {
          format: 'stub',
          generated_by: 'pipeline-hook-stub',
          generated_at: new Date().toISOString(),
        },
      };
    };
  }
}
