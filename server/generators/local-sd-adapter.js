import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { BaseGenerator } from './base-generator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = join(__dirname, '..', 'data', 'assets', 'images');

export class LocalSDAdapter extends BaseGenerator {
  constructor(options = {}) {
    super('local-sd', { priority: 10, ...options });
    this.baseURL = process.env.SD_WEBUI_URL || 'http://127.0.0.1:7860';
    this.comfyURL = process.env.COMFYUI_URL || '';
    this.useComfyUI = !!process.env.COMFYUI_URL;
    try { mkdirSync(IMAGES_DIR, { recursive: true }); } catch {}
  }

  isConfigured() {
    return !!(process.env.SD_WEBUI_URL || process.env.COMFYUI_URL);
  }

  async healthCheck() {
    if (!this.isConfigured()) return { name: this.name, status: 'not_configured' };
    try {
      const url = this.useComfyUI ? `${this.comfyURL}/system_stats` : `${this.baseURL}/sdapi/v1/options`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      return { name: this.name, status: res.ok ? 'online' : 'error', mode: this.useComfyUI ? 'comfyui' : 'webui' };
    } catch {
      return { name: this.name, status: 'offline' };
    }
  }

  async generate(params) {
    const { character_name, character_description, action_label, asset_type, prompt: customPrompt } = params;
    const prompt = customPrompt || this.buildPrompt(character_name, character_description, action_label, asset_type);

    if (this.useComfyUI) {
      return await this.generateComfyUI(prompt, params);
    }
    return await this.generateWebUI(prompt, params);
  }

  async generateWebUI(prompt, params) {
    const res = await fetch(`${this.baseURL}/sdapi/v1/txt2img`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        negative_prompt: 'low quality, blurry, distorted, deformed, ugly, bad anatomy, extra limbs',
        steps: 25,
        cfg_scale: 7,
        width: 512,
        height: 512,
        sampler_name: 'DPM++ 2M Karras',
      }),
    });

    if (!res.ok) throw new Error(`WebUI error: ${res.status} ${await res.text()}`);
    const data = await res.json();
    const imgBuffer = Buffer.from(data.images[0], 'base64');
    return this.saveImage(imgBuffer, params, { generator: 'local-sd-webui', prompt });
  }

  async generateComfyUI(prompt, params) {
    const workflow = this.buildComfyWorkflow(prompt);
    const res = await fetch(`${this.comfyURL}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow }),
    });

    if (!res.ok) throw new Error(`ComfyUI error: ${res.status} ${await res.text()}`);
    const { prompt_id } = await res.json();

    // Poll for completion
    let result = null;
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const hist = await fetch(`${this.comfyURL}/history/${prompt_id}`);
      const history = await hist.json();
      if (history[prompt_id]?.outputs) {
        const outputs = history[prompt_id].outputs;
        const nodeIds = Object.keys(outputs);
        for (const nodeId of nodeIds) {
          if (outputs[nodeId].images?.length > 0) {
            result = outputs[nodeId].images[0];
            break;
          }
        }
        if (result) break;
      }
    }

    if (!result) throw new Error('ComfyUI generation timed out');

    const imgRes = await fetch(`${this.comfyURL}/view?filename=${result.filename}&subfolder=${result.subfolder || ''}&type=output`);
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
    return this.saveImage(imgBuffer, params, { generator: 'local-sd-comfyui', prompt, prompt_id });
  }

  buildComfyWorkflow(prompt) {
    return {
      "3": {
        "class_type": "KSampler",
        "inputs": { "seed": Math.floor(Math.random() * 999999999), "steps": 25, "cfg": 7, "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": 1, "model": ["4", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0] }
      },
      "4": { "class_type": "CheckpointLoaderSimple", "inputs": { "ckpt_name": "v1-5-pruned-emaonly.safetensors" } },
      "5": { "class_type": "EmptyLatentImage", "inputs": { "width": 512, "height": 512, "batch_size": 1 } },
      "6": { "class_type": "CLIPTextEncode", "inputs": { "text": prompt, "clip": ["4", 1] } },
      "7": { "class_type": "CLIPTextEncode", "inputs": { "text": "low quality, blurry, distorted, deformed, ugly", "clip": ["4", 1] } },
      "8": { "class_type": "VAEDecode", "inputs": { "samples": ["3", 0], "vae": ["4", 2] } },
      "9": { "class_type": "SaveImage", "inputs": { "filename_prefix": "friendlyfriends", "images": ["8", 0] } },
    };
  }

  buildPrompt(name, desc, action, type) {
    const style = 'cartoon style, children\'s book illustration, colorful, cute, friendly, 2D animation';
    const quality = 'high quality, detailed, clean lines';
    return `${name} the ${desc}, ${action}, ${type === 'expression' ? 'facial expression' : 'full body pose'}, ${style}, ${quality}`;
  }

  saveImage(buffer, params, metadata) {
    const filename = `${params.asset_type}-${params.action_label.replace(/\s+/g, '_')}-${params.character_name.toLowerCase()}-${Date.now()}.png`;
    const filePath = join(IMAGES_DIR, filename);
    writeFileSync(filePath, buffer);
    return {
      asset_ref: `images/${filename}`,
      metadata: { ...metadata, width: 512, height: 512, format: 'png', generated_at: new Date().toISOString() },
    };
  }
}
