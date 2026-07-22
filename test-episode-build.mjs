/**
 * Full Episode Build Test
 * Creates a 3-scene episode about Achilles the blind service dog
 * Runs: assets → backgrounds → TTS audio → Ken Burns video → final MP4
 */

import { initDb, getDb } from './server/db/database.js';
import { createGenerators } from './server/generators/index.js';
import { EdgeTTSAdapter } from './server/generators/edge-tts-adapter.js';
import { VideoAssembler } from './server/inventory/video-assembler.js';
import { EpisodeManager } from './server/inventory/episode-manager.js';
import { PromptBuilder } from './server/generators/prompt-builder.js';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log('=== FULL EPISODE BUILD TEST ===\n');

// Initialize
await initDb();
const db = getDb();
const generators = createGenerators();
const tts = new EdgeTTSAdapter();
const assembler = new VideoAssembler();
const episodes = new EpisodeManager(db);

console.log('Pipeline status:');
console.log(`  Generators: ${generators.getStats().total >= 0 ? 'OK' : 'N/A'} (Pollinations)`);
console.log(`  TTS: ${tts.isConfigured() ? 'OK' : 'NOT INSTALLED'}`);
console.log(`  FFmpeg: ${assembler.isConfigured() ? 'OK' : 'NOT INSTALLED'}\n`);

if (!tts.isConfigured() || !assembler.isConfigured()) {
  console.error('Both TTS and FFmpeg are required. Exiting.');
  process.exit(1);
}

// Step 1: Create episode
console.log('--- Step 1: Creating episode ---');
const ep = episodes.createEpisode({
  title: 'Achilles Explores the Garden',
  slug: 'achilles-garden-explore',
  description: 'Achilles the blind service dog explores his favorite garden',
});
console.log(`Episode: "${ep.title}" (id: ${ep.id})\n`);

// Step 2: Add scenes
console.log('--- Step 2: Adding scenes ---');

const scenes = [
  {
    title: 'Scene 1: Morning Walk',
    narration: 'Every morning, Achilles the blind service dog walks through the garden. He cannot see the colorful flowers, but he can smell them.',
    background_scene: 'garden',
    dialogue: [
      { character_slug: 'narrator', text: 'Every morning, Achilles the blind service dog walks through the garden.' },
      { character_slug: 'achilles', text: 'I love the smell of these flowers!' },
    ],
    actions: [
      { character_slug: 'achilles', action_label: 'walking' },
    ],
  },
  {
    title: 'Scene 2: Finding Athena',
    narration: 'Achilles hears a familiar bark. It is his sister Athena, playing near the fountain.',
    background_scene: 'backyard',
    dialogue: [
      { character_slug: 'narrator', text: 'Achilles hears a familiar bark. It is his sister Athena.' },
      { character_slug: 'athena', text: 'Achilles! Come play with me!' },
    ],
    actions: [
      { character_slug: 'achilles', action_label: 'looking' },
      { character_slug: 'athena', action_label: 'sitting' },
    ],
  },
  {
    title: 'Scene 3: Happy Together',
    narration: 'The two dogs sit together in the warm sun. Achilles wags his tail happily.',
    background_scene: 'park',
    dialogue: [
      { character_slug: 'narrator', text: 'The two dogs sit together in the warm sun.' },
      { character_slug: 'achilles', text: 'This is the best day ever!' },
    ],
    actions: [
      { character_slug: 'achilles', action_label: 'happy' },
      { character_slug: 'athena', action_label: 'happy' },
    ],
  },
];

for (const scene of scenes) {
  const s = episodes.addScene(ep.id, scene);
  console.log(`  Added: ${scene.title} (id: ${s.id})`);
}

// Step 3: Generate backgrounds
console.log('\n--- Step 3: Generating backgrounds ---');
const epWithScenes = episodes.getEpisode(ep.id);

for (const scene of epWithScenes.scenes) {
  try {
    const bgPrompt = PromptBuilder.buildBackgroundPrompt(scene.background_scene || 'indoor_general');
    console.log(`  Generating: ${scene.background_scene}...`);
    const bgResult = await generators.generate({
      character_slug: 'background',
      action_label: scene.background_scene || 'indoor_general',
      asset_type: 'background_interaction',
      prompt: bgPrompt,
    });
    episodes.updateScene(scene.id, { image_asset_ref: bgResult.asset_ref });
    console.log(`  OK: ${bgResult.asset_ref}`);
  } catch (e) {
    console.log(`  FAILED: ${e.message}`);
  }
}

// Step 4: Generate TTS audio
console.log('\n--- Step 4: Generating TTS audio ---');

for (const scene of epWithScenes.scenes) {
  try {
    const dialogue = typeof scene.dialogue === 'string' ? JSON.parse(scene.dialogue) : scene.dialogue;
    const narration = scene.narration;

    // Generate narrator voice
    if (narration) {
      const narratorResult = await tts.generate({ text: narration, character_slug: 'narrator' });
      console.log(`  Narrator (${scene.title}): ${narratorResult.asset_ref}`);

      // Store first audio ref for video assembly
      episodes.updateScene(scene.id, { audio_asset_ref: narratorResult.asset_ref });
    }

    // Generate character dialogue
    if (dialogue && dialogue.length > 0) {
      for (const line of dialogue) {
        if (line.character_slug === 'narrator') continue; // Already done
        try {
          const charResult = await tts.generate({ text: line.text, character_slug: line.character_slug });
          console.log(`  ${line.character_slug} (${scene.title}): ${charResult.asset_ref}`);
        } catch (e) {
          console.log(`  ${line.character_slug} FAILED: ${e.message}`);
        }
      }
    }
  } catch (e) {
    console.log(`  Audio FAILED for ${scene.title}: ${e.message}`);
  }
}

// Step 5: Assemble Ken Burns videos
console.log('\n--- Step 5: Assembling Ken Burns videos ---');
const assembledVideos = [];

for (const scene of epWithScenes.scenes) {
  const updated = db.prepare('SELECT * FROM scenes WHERE id = ?').get(scene.id);
  if (updated.image_asset_ref) {
    try {
      console.log(`  Assembling: ${scene.title}...`);
      const vidResult = await assembler.assembleScene({
        image_ref: updated.image_asset_ref,
        audio_ref: updated.audio_asset_ref,
        duration: 6,
        scene_id: scene.id,
      });
      episodes.updateScene(scene.id, { video_asset_ref: vidResult.asset_ref, status: 'assembled' });
      assembledVideos.push({ asset_ref: vidResult.asset_ref, duration: vidResult.metadata.duration || 6 });
      console.log(`  OK: ${vidResult.asset_ref} (${vidResult.metadata.duration}s)`);
    } catch (e) {
      console.log(`  FAILED: ${e.message}`);
    }
  }
}

// Step 6: Concatenate into final episode
console.log('\n--- Step 6: Concatenating final episode ---');
let finalVideo = null;
if (assembledVideos.length > 0) {
  try {
    finalVideo = await assembler.assembleEpisode(assembledVideos, ep.slug);
    episodes.updateEpisode(ep.id, {
      status: 'assembled',
      metadata: { ...ep.metadata, final_video: finalVideo.asset_ref },
    });
    console.log(`  Final video: ${finalVideo.asset_ref}`);
    console.log(`  Duration: ${finalVideo.metadata.total_duration}s`);
    console.log(`  Resolution: ${finalVideo.metadata.width}x${finalVideo.metadata.height}`);
    console.log(`  Scenes: ${finalVideo.metadata.scene_count}`);
  } catch (e) {
    console.log(`  FAILED: ${e.message}`);
  }
}

// Summary
console.log('\n=== BUILD COMPLETE ===');
const finalEp = episodes.getEpisode(ep.id);
console.log(`\nEpisode: "${finalEp.title}"`);
console.log(`Status: ${finalEp.status}`);
console.log(`Scenes: ${finalEp.scenes.length}`);
for (const scene of finalEp.scenes) {
  console.log(`  ${scene.title}:`);
  console.log(`    Background: ${scene.image_asset_ref || 'none'}`);
  console.log(`    Audio: ${scene.audio_asset_ref || 'none'}`);
  console.log(`    Video: ${scene.video_asset_ref || 'none'}`);
}
if (finalVideo) {
  console.log(`\nFinal MP4: server/data/assets/${finalVideo.asset_ref}`);
}
