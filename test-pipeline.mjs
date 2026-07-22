/**
 * Full Pipeline Test — end-to-end scene generation
 * 1. Pollinations background image (free)
 * 2. Edge TTS narration audio (free)
 * 3. FFmpeg Ken Burns video assembly
 */

import { PollinationsAdapter } from './server/generators/pollinations-adapter.js';
import { EdgeTTSAdapter } from './server/generators/edge-tts-adapter.js';
import { VideoAssembler } from './server/inventory/video-assembler.js';
import { PromptBuilder } from './server/generators/prompt-builder.js';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = join(__dirname, 'server', 'data', 'assets', 'images');
const AUDIO_DIR = join(__dirname, 'server', 'data', 'assets', 'audio');
const VIDEO_DIR = join(__dirname, 'server', 'data', 'assets', 'video');

console.log('=== FULL PIPELINE TEST ===\n');

// Initialize adapters
const imageGen = new PollinationsAdapter();
const tts = new EdgeTTSAdapter();
const video = new VideoAssembler();

console.log('Adapters initialized:');
console.log(`  Pollinations: ${imageGen.isConfigured() ? 'OK' : 'NOT CONFIGURED'}`);
console.log(`  Edge TTS:     ${tts.isConfigured() ? 'OK' : 'NOT INSTALLED'}`);
console.log(`  FFmpeg:       ${video.isConfigured() ? 'OK' : 'NOT INSTALLED'}\n`);

if (!imageGen.isConfigured()) {
  console.error('Pollinations is required. Exiting.');
  process.exit(1);
}

const CHARACTER = 'achilles';
const BACKGROUND = 'backyard';
const NARRATION = 'Achilles wagged his tail happily as he explored the sunny backyard. Even though he could not see, he knew every corner of this garden by heart.';
const ACTION_LABEL = 'walking';

// Step 1: Generate background image
console.log('--- Step 1: Generating background image ---');
let backgroundResult;
try {
  const bgPrompt = PromptBuilder.buildBackgroundPrompt(BACKGROUND);
  console.log(`Prompt: ${bgPrompt}\n`);
  backgroundResult = await imageGen.generate({
    character_name: BACKGROUND,
    character_description: '',
    action_label: BACKGROUND,
    asset_type: 'background',
  });
  console.log(`Image: ${backgroundResult.asset_ref}`);
  const imgPath = join(IMAGES_DIR, backgroundResult.asset_ref.replace('images/', ''));
  console.log(`File exists: ${existsSync(imgPath)} (${existsSync(imgPath) ? 'OK' : 'FAIL'})\n`);
} catch (e) {
  console.error(`Image generation FAILED: ${e.message}\n`);
  process.exit(1);
}

// Step 2: Generate TTS narration
console.log('--- Step 2: Generating TTS narration ---');
let audioResult;
try {
  audioResult = await tts.generate({
    text: NARRATION,
    character_slug: 'narrator',
  });
  console.log(`Audio: ${audioResult.asset_ref}`);
  const audioPath = join(AUDIO_DIR, audioResult.asset_ref.replace('audio/', ''));
  console.log(`File exists: ${existsSync(audioPath)} (${existsSync(audioPath) ? 'OK' : 'FAIL'})\n`);
} catch (e) {
  console.error(`TTS generation FAILED: ${e.message}\n`);
  process.exit(1);
}

// Step 3: Assemble Ken Burns video
console.log('--- Step 3: Assembling Ken Burns video ---');
let videoResult;
try {
  videoResult = await video.assembleScene({
    image_ref: backgroundResult.asset_ref,
    audio_ref: audioResult.asset_ref,
    duration: 8,
    scene_id: `test-${Date.now()}`,
  });
  console.log(`Video: ${videoResult.asset_ref}`);
  const videoPath = join(VIDEO_DIR, videoResult.asset_ref.replace('video/', ''));
  console.log(`File exists: ${existsSync(videoPath)} (${existsSync(videoPath) ? 'OK' : 'FAIL'})`);
  console.log(`Duration: ${videoResult.metadata.duration}s`);
  console.log(`Resolution: ${videoResult.metadata.width}x${videoResult.metadata.height}\n`);
} catch (e) {
  console.error(`Video assembly FAILED: ${e.message}\n`);
  process.exit(1);
}

console.log('=== ALL STEPS PASSED ===');
console.log(`\nGenerated assets:`);
console.log(`  Image: server/data/assets/${backgroundResult.asset_ref}`);
console.log(`  Audio: server/data/assets/${audioResult.asset_ref}`);
console.log(`  Video: server/data/assets/${videoResult.asset_ref}`);
