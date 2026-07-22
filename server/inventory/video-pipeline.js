import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, writeFileSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, '..', 'data', 'assets');

export class VideoPipeline {
  constructor(inventory, generators) {
    this.inventory = inventory;
    this.generators = generators || null;
    this.hook = null;
    try { mkdirSync(ASSETS_DIR, { recursive: true }); } catch {}
  }

  setHook(hook) {
    this.hook = hook;
  }

  /**
   * Generate an episode/scene. Given a script with character actions,
   * resolves each action against the inventory — reuses existing assets,
   * generates only what's missing, and saves everything back.
   *
   * @param {object} scene - { title, actions: [{ character_slug, action_label, asset_type }] }
   * @param {Function} generateFn - async (slug, label, type) => { asset_ref, metadata }
   * @returns {object} - { assets: [...], reused: number, generated: number, gaps: [...] }
   */
  async generateScene(scene, generateFn) {
    const results = { assets: [], reused: 0, generated: 0, gaps: [] };

    for (const action of scene.actions) {
      const character = this.inventory.getCharacterBySlug(action.character_slug);
      if (!character) {
        results.gaps.push({ error: `Character '${action.character_slug}' not found`, action });
        continue;
      }

      const assetType = action.asset_type || this.classifyAction(action.action_label);
      const existing = this.inventory.lookupAsset(character.id, action.action_label, assetType);

      if (existing) {
        this.inventory.incrementAssetUse(existing.id);
        results.assets.push({ ...existing, reused: true });
        results.reused++;
      } else {
        let generated;
        try {
          if (generateFn) {
            generated = await generateFn(action.character_slug, action.action_label, assetType);
          } else if (this.generators) {
            generated = await this.generators.generate({
              character_slug: action.character_slug,
              action_label: action.action_label,
              asset_type: assetType,
            });
          } else {
            generated = await VideoPipeline.stubGenerator(action.action_label, assetType)();
          }
        } catch (e) {
          results.gaps.push({ error: e.message, action, character_id: character.id });
          this.inventory.createGap(character.id, action.action_label, assetType);
          continue;
        }

        const asset = this.inventory.createAsset(character.id, {
          type: assetType,
          label: action.action_label,
          asset_ref: generated.asset_ref,
          metadata: { ...(generated.metadata || {}), generator: generated.generator || 'stub' },
          source: 'generated',
        });

        // Auto-resolve matching gaps
        const gaps = this.inventory.getGaps({ status: 'pending', character_id: character.id });
        for (const gap of gaps) {
          if (gap.requested_label === action.action_label && gap.asset_type === assetType) {
            this.inventory.resolveGap(gap.id);
          }
        }

        results.assets.push({ ...asset, reused: false });
        results.generated++;
      }
    }

    return results;
  }

  /**
   * Process a full episode script — extract all required assets,
   * resolve against inventory, generate what's missing.
   */
  async processEpisode(episode, generateFn) {
    const allResults = { scenes: [], totalReused: 0, totalGenerated: 0, totalGaps: 0 };

    for (const scene of episode.scenes) {
      const result = await this.generateScene(scene, generateFn);
      allResults.scenes.push({ title: scene.title, ...result });
      allResults.totalReused += result.reused;
      allResults.totalGenerated += result.generated;
      allResults.totalGaps += result.gaps.length;
    }

    return allResults;
  }

  classifyAction(label) {
    const movement = ['walking', 'walk', 'running', 'run', 'jumping', 'jump', 'climbing', 'climb', 'flying', 'fly', 'hopping', 'hop', 'fluttering', 'flutter', 'crawling', 'crawl', 'swimming', 'swim'];
    const expression = ['happy', 'sad', 'excited', 'scared', 'angry', 'curious', 'surprised', 'sleepy', 'confused', 'proud', 'worried', 'content', 'playful'];
    const lower = label.toLowerCase();
    if (movement.some(m => lower.includes(m))) return 'movement_cycle';
    if (expression.some(e => lower.includes(e))) return 'expression';
    return 'pose';
  }

  /**
   * Stub generator — creates placeholder asset files.
   * Used as fallback when no real generators are available.
   */
  static stubGenerator(label, type) {
    return async () => {
      const filename = `${type}-${label.replace(/\s+/g, '_')}-${Date.now()}.stub`;
      const filePath = join(ASSETS_DIR, filename);
      writeFileSync(filePath, `stub asset for ${type}: ${label}\ncreated: ${new Date().toISOString()}`);
      return {
        asset_ref: `assets/${filename}`,
        metadata: {
          format: 'stub',
          generated_by: 'video-pipeline-stub',
          generated_at: new Date().toISOString(),
        },
        generator: 'stub',
      };
    };
  }
}
