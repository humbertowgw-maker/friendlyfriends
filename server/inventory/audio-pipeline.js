import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUDIO_DIR = join(__dirname, '..', 'data', 'assets', 'audio');

export class AudioPipeline {
  constructor(ttsAdapter) {
    this.tts = ttsAdapter;
    try { mkdirSync(AUDIO_DIR, { recursive: true }); } catch {}
  }

  /**
   * Generate narration audio for a script line.
   * @param {object} params - { text, character_slug, rate, pitch }
   * @returns {Promise<{ asset_ref, metadata }>}
   */
  async generateNarration(params) {
    if (!this.tts || !this.tts.isConfigured()) {
      throw new Error('TTS not available. Install edge-tts: pip install edge-tts');
    }
    return await this.tts.generate(params);
  }

  /**
   * Generate voice lines for a scene — each character's dialogue + narration.
   * @param {object} scene - { narration, dialogue: [{ character_slug, text, rate, pitch }] }
   * @returns {Promise<{ lines: [...], total: number }>}
   */
  async generateSceneAudio(scene) {
    const results = { lines: [], total: 0 };

    // Generate narration first
    if (scene.narration) {
      try {
        const audio = await this.generateNarration({
          text: scene.narration,
          character_slug: 'narrator',
        });
        results.lines.push({ type: 'narration', ...audio });
        results.total++;
      } catch (e) {
        results.lines.push({ type: 'narration', error: e.message });
      }
    }

    // Generate character dialogue
    if (scene.dialogue && Array.isArray(scene.dialogue)) {
      for (const line of scene.dialogue) {
        try {
          const audio = await this.generateNarration({
            text: line.text,
            character_slug: line.character_slug,
            rate: line.rate || '+0%',
            pitch: line.pitch || '+0Hz',
          });
          results.lines.push({ type: 'dialogue', character_slug: line.character_slug, ...audio });
          results.total++;
        } catch (e) {
          results.lines.push({ type: 'dialogue', character_slug: line.character_slug, error: e.message });
        }
      }
    }

    return results;
  }

  /**
   * Generate audio for a full episode.
   * @param {object} episode - { title, scenes: [{ narration, dialogue }] }
   * @returns {Promise<{ scenes: [...], totalLines: number }>}
   */
  async generateEpisodeAudio(episode) {
    const allResults = { scenes: [], totalLines: 0 };

    for (const scene of episode.scenes) {
      const result = await this.generateSceneAudio(scene);
      allResults.scenes.push({ title: scene.title || 'Untitled', ...result });
      allResults.totalLines += result.total;
    }

    return allResults;
  }

  /**
   * Get audio pipeline status.
   */
  getStatus() {
    return {
      tts_available: this.tts?.isConfigured() || false,
      tts_name: this.tts?.name || 'none',
      voices: this.tts?.getVoices?.() || [],
    };
  }
}
