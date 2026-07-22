import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { BaseGenerator } from './base-generator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = join(__dirname, '..', 'data', 'assets', 'images');

export class PollinationsAdapter extends BaseGenerator {
  constructor(options = {}) {
    super('pollinations', { priority: 50, ...options });
    this.baseURL = 'https://image.pollinations.ai/prompt';
    try { mkdirSync(IMAGES_DIR, { recursive: true }); } catch {}
  }

  isConfigured() {
    return true; // Free, no API key needed
  }

  async healthCheck() {
    try {
      const res = await fetch('https://image.pollinations.ai/prompt/test?width=64&height=64&nologo=true', {
        signal: AbortSignal.timeout(10000),
      });
      return { name: this.name, status: res.ok ? 'online' : 'error' };
    } catch {
      return { name: this.name, status: 'offline' };
    }
  }

  async generate(params) {
    const { character_name, character_description, action_label, asset_type } = params;
    const prompt = this.buildPrompt(character_name, character_description, action_label, asset_type);
    const encodedPrompt = encodeURIComponent(prompt);
    const seed = Math.floor(Math.random() * 999999);
    const url = `${this.baseURL}/${encodedPrompt}?width=512&height=512&seed=${seed}&nologo=true&model=flux`;

    const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new Error(`Pollinations error: ${res.status}`);

    const buffer = Buffer.from(await res.arrayBuffer());
    const filename = `${asset_type}-${action_label.replace(/\s+/g, '_')}-${character_name.toLowerCase()}-${Date.now()}.png`;
    const filePath = join(IMAGES_DIR, filename);
    writeFileSync(filePath, buffer);

    return {
      asset_ref: `images/${filename}`,
      metadata: {
        generator: 'pollinations',
        prompt,
        seed,
        width: 512,
        height: 512,
        format: 'png',
        generated_at: new Date().toISOString(),
      },
    };
  }

  buildPrompt(name, desc, action, type) {
    const style = 'cartoon style, children book illustration, colorful, cute, friendly character, 2D animation, clean lines';
    const quality = 'high quality, detailed';
    const negative = 'ugly, blurry, low quality, photorealistic, dark';
    return `${name} the ${desc}, ${action}, ${type === 'expression' ? 'facial expression closeup' : 'full body pose'}, ${style}, ${quality}, ${negative} --no photorealistic dark`;
  }
}
