import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { BaseGenerator } from './base-generator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = join(__dirname, '..', 'data', 'assets', 'images');

export class HuggingFaceAdapter extends BaseGenerator {
  constructor(options = {}) {
    super('huggingface', { priority: 40, ...options });
    this.apiKey = process.env.HF_API_TOKEN || '';
    this.model = process.env.HF_MODEL || 'stabilityai/stable-diffusion-xl-base-1.0';
    this.apiURL = `https://api-inference.huggingface.co/models/${this.model}`;
    try { mkdirSync(IMAGES_DIR, { recursive: true }); } catch {}
  }

  isConfigured() {
    return !!this.apiKey;
  }

  async healthCheck() {
    if (!this.isConfigured()) return { name: this.name, status: 'not_configured' };
    try {
      const res = await fetch(this.apiURL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ inputs: 'test' }),
        signal: AbortSignal.timeout(10000),
      });
      // HF returns 503 when model is loading, which is still "alive"
      return { name: this.name, status: res.ok || res.status === 503 ? 'online' : 'error', model: this.model };
    } catch {
      return { name: this.name, status: 'offline' };
    }
  }

  async generate(params) {
    if (!this.isConfigured()) throw new Error('HuggingFace API token not configured');

    const { character_name, character_description, action_label, asset_type } = params;
    const prompt = this.buildPrompt(character_name, character_description, action_label, asset_type);

    const res = await fetch(this.apiURL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          negative_prompt: 'low quality, blurry, distorted, deformed, ugly, photorealistic, dark',
          width: 512,
          height: 512,
          num_inference_steps: 25,
        },
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`HuggingFace error: ${res.status} ${err}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const filename = `${asset_type}-${action_label.replace(/\s+/g, '_')}-${character_name.toLowerCase()}-${Date.now()}.png`;
    const filePath = join(IMAGES_DIR, filename);
    writeFileSync(filePath, buffer);

    return {
      asset_ref: `images/${filename}`,
      metadata: {
        generator: 'huggingface',
        model: this.model,
        prompt,
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
    return `${name} the ${desc}, ${action}, ${type === 'expression' ? 'facial expression' : 'full body pose'}, ${style}, ${quality}`;
  }
}
