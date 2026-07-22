import { execSync } from 'child_process';
import { mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUDIO_DIR = join(__dirname, '..', 'data', 'assets', 'audio');

// Free Edge TTS voices — no API key needed
const VOICE_MAP = {
  narrator: 'en-US-GuyNeural',
  achilles: 'en-US-ChristopherNeural',
  athena: 'en-US-JennyNeural',
  henry: 'en-US-AndrewNeural',
  falcor: 'en-US-DavisNeural',
  peter: 'en-US-JasonNeural',
  walter: 'en-US-TonyNeural',
};

const STYLE_MAP = {
  narrator: 'calm',
  achilles: 'gentle',
  athena: 'friendly',
  henry: 'curious',
  falcor: 'wise',
  peter: 'cheerful',
  walter: 'playful',
};

export class EdgeTTSAdapter {
  constructor() {
    this.name = 'edge-tts';
    this.available = false;
    try { mkdirSync(AUDIO_DIR, { recursive: true }); } catch {}
    this.checkAvailability();
  }

  checkAvailability() {
    const paths = [
      'edge-tts',
      join(process.env.APPDATA || '', 'Python', 'Python314', 'Scripts', 'edge-tts.exe'),
      join(process.env.APPDATA || '', 'Python', 'Python312', 'Scripts', 'edge-tts.exe'),
      join(process.env.APPDATA || '', 'Python', 'Python311', 'Scripts', 'edge-tts.exe'),
    ];
    for (const cmd of paths) {
      try {
        execSync(`"${cmd}" --version`, { stdio: 'pipe', timeout: 5000 });
        this.cmd = cmd;
        this.available = true;
        return;
      } catch {}
    }
    this.available = false;
  }

  isConfigured() {
    return this.available;
  }

  /**
   * Generate speech audio from text.
   * @param {object} params - { text, character_slug, rate, pitch }
   * @returns {Promise<{ asset_ref: string, metadata: object }>}
   */
  async generate(params) {
    const { text, character_slug = 'narrator', rate = '+0%', pitch = '+0Hz' } = params;

    if (!this.available) {
      throw new Error('edge-tts not installed. Run: pip install edge-tts');
    }

    const voice = VOICE_MAP[character_slug] || VOICE_MAP.narrator;
    const filename = `${character_slug}-${Date.now()}.mp3`;
    const filePath = join(AUDIO_DIR, filename);

    const rateStr = rate.startsWith('+') || rate.startsWith('-') ? rate : `+${rate}%`;
    const pitchStr = pitch.startsWith('+') || pitch.startsWith('-') ? pitch : `+${pitch}Hz`;

    const cmd = `"${this.cmd}" --voice "${voice}" --rate="${rateStr}" --pitch="${pitchStr}" --text "${text.replace(/"/g, '\\"')}" --write-media "${filePath}"`;

    try {
      execSync(cmd, { stdio: 'pipe', timeout: 30000 });
    } catch (e) {
      throw new Error(`TTS generation failed: ${e.message}`);
    }

    return {
      asset_ref: `audio/${filename}`,
      metadata: {
        generator: 'edge-tts',
        voice,
        character_slug,
        text,
        rate: rateStr,
        pitch: pitchStr,
        format: 'mp3',
        generated_at: new Date().toISOString(),
      },
    };
  }

  /**
   * List available voices.
   */
  getVoices() {
    return Object.entries(VOICE_MAP).map(([slug, voice]) => ({
      slug,
      voice,
      style: STYLE_MAP[slug] || 'neutral',
    }));
  }

  async healthCheck() {
    return {
      name: this.name,
      status: this.available ? 'online' : 'not_installed',
      hint: this.available ? null : 'Install with: pip install edge-tts',
    };
  }
}
