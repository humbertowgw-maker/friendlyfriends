import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, '..', 'data', 'assets', 'video');
const IMAGES_DIR = join(__dirname, '..', 'data', 'assets', 'images');
const AUDIO_DIR = join(__dirname, '..', 'data', 'assets', 'audio');

import { mkdirSync } from 'fs';
try { mkdirSync(OUTPUT_DIR, { recursive: true }); } catch {}

export class VideoAssembler {
  constructor() {
    this.available = false;
    this.checkAvailability();
  }

  checkAvailability() {
    try {
      execSync('ffmpeg -version', { stdio: 'pipe', timeout: 5000 });
      this.available = true;
    } catch {
      this.available = false;
    }
  }

  isConfigured() {
    return this.available;
  }

  /**
   * Assemble a scene into a video clip: image + narration audio → video with Ken Burns effect.
   * @param {object} params - { image_ref, audio_ref, duration, scene_id }
   * @returns {Promise<{ asset_ref, metadata }>}
   */
  async assembleScene(params) {
    const { image_ref, audio_ref, duration = 5, scene_id } = params;

    if (!this.available) {
      throw new Error('FFmpeg not installed. Install from https://ffmpeg.org/download.html');
    }

    const imagePath = join(IMAGES_DIR, image_ref.replace('images/', ''));
    const outputPath = join(OUTPUT_DIR, `scene-${scene_id || Date.now()}.mp4`);

    if (!existsSync(imagePath)) {
      throw new Error(`Image not found: ${imagePath}`);
    }

    if (audio_ref) {
      const audioPath = join(AUDIO_DIR, audio_ref.replace('audio/', ''));
      if (existsSync(audioPath)) {
        // Get audio duration
        const audioDuration = this.getAudioDuration(audioPath);
        const totalDuration = Math.max(duration, audioDuration + 0.5);

        // Ken Burns: slow zoom + pan on image, with audio
        const cmd = `ffmpeg -y -loop 1 -i "${imagePath}" -i "${audioPath}" -c:v libx264 -tune stillimage -c:a aac -b:a 192k -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,zoompan=z='min(zoom+0.0005,1.1)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${Math.floor(totalDuration * 25)}:s=1280x720:fps=25" -pix_fmt yuv420p -shortest "${outputPath}"`;
        execSync(cmd, { stdio: 'pipe', timeout: 60000 });
      } else {
        // Image only, no audio
        await this.assembleScene({ image_ref, duration, scene_id });
      }
    } else {
      // Image only — silent video with Ken Burns
      const frames = Math.floor(duration * 25);
      const cmd = `ffmpeg -y -loop 1 -i "${imagePath}" -c:v libx264 -tune stillimage -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,zoompan=z='min(zoom+0.0005,1.1)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1280x720:fps=25" -t ${duration} -pix_fmt yuv420p "${outputPath}"`;
      execSync(cmd, { stdio: 'pipe', timeout: 60000 });
    }

    const stats = this.getVideoInfo(outputPath);
    return {
      asset_ref: `video/${outputPath.split(/[\\/]/).pop()}`,
      metadata: {
        generator: 'ffmpeg',
        image_ref,
        audio_ref: audio_ref || null,
        duration: stats.duration,
        width: stats.width,
        height: stats.height,
        format: 'mp4',
        generated_at: new Date().toISOString(),
      },
    };
  }

  /**
   * Concatenate multiple scene videos into a single episode video.
   * @param {object[]} sceneVideos - [{ asset_ref, duration }]
   * @param {string} episodeSlug
   * @returns {Promise<{ asset_ref, metadata }>}
   */
  async assembleEpisode(sceneVideos, episodeSlug) {
    if (!this.available) throw new Error('FFmpeg not installed');

    const listFile = join(OUTPUT_DIR, `concat-${episodeSlug}-${Date.now()}.txt`);
    const outputPath = join(OUTPUT_DIR, `episode-${episodeSlug}-${Date.now()}.mp4`);

    // Create concat list
    const lines = sceneVideos.map(sv => {
      const filePath = join(OUTPUT_DIR, sv.asset_ref.replace('video/', ''));
      return `file '${filePath.replace(/\\/g, '/')}'`;
    });
    const { writeFileSync } = await import('fs');
    writeFileSync(listFile, lines.join('\n'));

    const cmd = `ffmpeg -y -f concat -safe 0 -i "${listFile}" -c copy "${outputPath}"`;
    try {
      execSync(cmd, { stdio: 'pipe', timeout: 120000 });
    } finally {
      try { (await import('fs')).unlinkSync(listFile); } catch {}
    }

    const stats = this.getVideoInfo(outputPath);
    const totalDuration = sceneVideos.reduce((sum, sv) => sum + (sv.duration || 5), 0);

    return {
      asset_ref: `video/${outputPath.split(/[\\/]/).pop()}`,
      metadata: {
        generator: 'ffmpeg-concat',
        scene_count: sceneVideos.length,
        total_duration: totalDuration,
        width: stats.width,
        height: stats.height,
        format: 'mp4',
        generated_at: new Date().toISOString(),
      },
    };
  }

  getAudioDuration(filePath) {
    try {
      const result = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`, { stdio: 'pipe', timeout: 10000 });
      return parseFloat(result.toString().trim()) || 5;
    } catch {
      return 5;
    }
  }

  getVideoInfo(filePath) {
    try {
      const duration = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`, { stdio: 'pipe', timeout: 10000 });
      const width = execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=width -of default=noprint_wrappers=1:nokey=1 "${filePath}"`, { stdio: 'pipe', timeout: 10000 });
      const height = execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=height -of default=noprint_wrappers=1:nokey=1 "${filePath}"`, { stdio: 'pipe', timeout: 10000 });
      return {
        duration: parseFloat(duration.toString().trim()) || 0,
        width: parseInt(width.toString().trim()) || 1280,
        height: parseInt(height.toString().trim()) || 720,
      };
    } catch {
      return { duration: 0, width: 1280, height: 720 };
    }
  }

  async healthCheck() {
    return {
      name: 'ffmpeg',
      status: this.available ? 'online' : 'not_installed',
      hint: this.available ? null : 'Install from https://ffmpeg.org/download.html',
    };
  }
}
