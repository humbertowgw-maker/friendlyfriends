import { Router } from 'express';
import { EpisodeManager } from './episode-manager.js';
import { CharacterInventory } from './character-inventory.js';
import { VideoPipeline } from './video-pipeline.js';
import { AudioPipeline } from './audio-pipeline.js';
import { VideoAssembler } from './video-assembler.js';
import { PromptBuilder } from '../generators/prompt-builder.js';

export function createEpisodeRoutes(db, generators, ttsAdapter) {
  const router = Router();
  const episodes = new EpisodeManager(db);
  const inventory = new CharacterInventory(db);
  const pipeline = new VideoPipeline(inventory, generators);
  const audio = new AudioPipeline(ttsAdapter);
  const assembler = new VideoAssembler();

  // --- Episodes CRUD ---

  router.get('/', (req, res) => {
    try {
      res.json(episodes.getAllEpisodes());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/stats', (req, res) => {
    try {
      res.json(episodes.getEpisodeStats());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/:id', (req, res) => {
    try {
      const ep = episodes.getEpisode(Number(req.params.id));
      if (!ep) return res.status(404).json({ error: 'Episode not found' });
      res.json(ep);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/', (req, res) => {
    try {
      const { title, slug, description, metadata } = req.body;
      if (!title || !slug) return res.status(400).json({ error: 'title and slug are required' });
      const existing = episodes.getEpisodeBySlug(slug);
      if (existing) return res.status(409).json({ error: 'Episode with this slug already exists' });
      const ep = episodes.createEpisode({ title, slug, description, metadata });
      res.status(201).json(ep);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.put('/:id', (req, res) => {
    try {
      const ep = episodes.updateEpisode(Number(req.params.id), req.body);
      if (!ep) return res.status(404).json({ error: 'Episode not found' });
      res.json(ep);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.delete('/:id', (req, res) => {
    try {
      episodes.deleteEpisode(Number(req.params.id));
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- Scenes ---

  router.post('/:id/scenes', (req, res) => {
    try {
      const ep = episodes.getEpisode(Number(req.params.id));
      if (!ep) return res.status(404).json({ error: 'Episode not found' });
      const scene = episodes.addScene(ep.id, req.body);
      res.status(201).json(scene);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.put('/scenes/:sceneId', (req, res) => {
    try {
      const scene = episodes.updateScene(Number(req.params.sceneId), req.body);
      if (!scene) return res.status(404).json({ error: 'Scene not found' });
      res.json(scene);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.delete('/scenes/:sceneId', (req, res) => {
    try {
      episodes.deleteScene(Number(req.params.sceneId));
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/:id/scenes/reorder', (req, res) => {
    try {
      const { scene_ids } = req.body;
      if (!scene_ids || !Array.isArray(scene_ids)) return res.status(400).json({ error: 'scene_ids array required' });
      episodes.reorderScenes(Number(req.params.id), scene_ids);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- Approvals ---

  router.post('/:id/approve/:stage', (req, res) => {
    try {
      const { reviewer, notes } = req.body;
      const ep = episodes.getEpisode(Number(req.params.id));
      if (!ep) return res.status(404).json({ error: 'Episode not found' });
      const approval = episodes.createApproval(ep.id, req.params.stage);
      episodes.approveStage(approval.id, reviewer, notes);
      res.json({ ok: true, approval_status: episodes.getEpisode(ep.id).approval_status });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/:id/reject/:stage', (req, res) => {
    try {
      const { reviewer, notes } = req.body;
      const ep = episodes.getEpisode(Number(req.params.id));
      if (!ep) return res.status(404).json({ error: 'Episode not found' });
      const approval = episodes.createApproval(ep.id, req.params.stage);
      episodes.rejectStage(approval.id, reviewer, notes);
      res.json({ ok: true, approval_status: episodes.getEpisode(ep.id).approval_status });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- Pipeline: Generate assets for episode ---

  router.post('/:id/generate-assets', async (req, res) => {
    try {
      const ep = episodes.getEpisode(Number(req.params.id));
      if (!ep) return res.status(404).json({ error: 'Episode not found' });

      const results = { scenes: [], totalReused: 0, totalGenerated: 0, totalGaps: 0 };

      for (const scene of ep.scenes) {
        const actions = typeof scene.actions === 'string' ? JSON.parse(scene.actions) : scene.actions;
        if (!actions || actions.length === 0) continue;

        const sceneResult = await pipeline.generateScene({ title: scene.title, actions });
        results.scenes.push({ scene_id: scene.id, title: scene.title, ...sceneResult });
        results.totalReused += sceneResult.reused;
        results.totalGenerated += sceneResult.generated;
        results.totalGaps += sceneResult.gaps.length;

        // Update scene status
        if (sceneResult.gaps.length === 0) {
          episodes.updateScene(scene.id, { status: 'assets_ready' });
        }
      }

      res.json(results);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- Pipeline: Generate background for scene ---

  router.post('/scenes/:sceneId/generate-background', async (req, res) => {
    try {
      const scene = episodes.updateScene(Number(req.params.sceneId), {});
      if (!scene) return res.status(404).json({ error: 'Scene not found' });

      const bgPrompt = PromptBuilder.buildBackgroundPrompt(scene.background_scene);
      if (!generators) return res.status(500).json({ error: 'No generators configured' });

      const result = await generators.generate({
        character_slug: 'background',
        action_label: scene.background_scene,
        asset_type: 'background_interaction',
        prompt: bgPrompt,
      });

      episodes.updateScene(scene.id, { image_asset_ref: result.asset_ref, metadata: { ...scene.metadata, background_generated: true } });
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- Pipeline: Generate audio for scene ---

  router.post('/scenes/:sceneId/generate-audio', async (req, res) => {
    try {
      const scene = episodes.getEpisode(0); // just need scene data
      const sceneData = db.prepare('SELECT * FROM scenes WHERE id = ?').get(Number(req.params.sceneId));
      if (!sceneData) return res.status(404).json({ error: 'Scene not found' });

      const dialogue = typeof sceneData.dialogue === 'string' ? JSON.parse(sceneData.dialogue) : sceneData.dialogue;
      const audioResult = await audio.generateSceneAudio({
        narration: sceneData.narration,
        dialogue,
      });

      // Use first audio file as scene audio ref
      const firstAudio = audioResult.lines.find(l => l.asset_ref);
      if (firstAudio) {
        episodes.updateScene(sceneData.id, { audio_asset_ref: firstAudio.asset_ref });
      }

      res.json(audioResult);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- Pipeline: Assemble scene video ---

  router.post('/scenes/:sceneId/assemble-video', async (req, res) => {
    try {
      const sceneData = db.prepare('SELECT * FROM scenes WHERE id = ?').get(Number(req.params.sceneId));
      if (!sceneData) return res.status(404).json({ error: 'Scene not found' });

      if (!sceneData.image_asset_ref) return res.status(400).json({ error: 'No image asset for this scene. Generate background first.' });

      const result = await assembler.assembleScene({
        image_ref: sceneData.image_asset_ref,
        audio_ref: sceneData.audio_asset_ref,
        duration: req.body.duration || 5,
        scene_id: sceneData.id,
      });

      episodes.updateScene(sceneData.id, { video_asset_ref: result.asset_ref, status: 'assembled' });
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- Pipeline: Full build (assets + backgrounds + audio + video) ---

  router.post('/:id/full-build', async (req, res) => {
    try {
      const ep = episodes.getEpisode(Number(req.params.id));
      if (!ep) return res.status(404).json({ error: 'Episode not found' });

      const buildLog = { steps: [] };

      // Step 1: Generate character assets
      for (const scene of ep.scenes) {
        const actions = typeof scene.actions === 'string' ? JSON.parse(scene.actions) : scene.actions;
        if (actions && actions.length > 0) {
          const assetResult = await pipeline.generateScene({ title: scene.title, actions });
          buildLog.steps.push({ step: 'assets', scene: scene.title, ...assetResult });
        }
      }

      // Step 2: Generate backgrounds
      for (const scene of ep.scenes) {
        try {
          const bgPrompt = PromptBuilder.buildBackgroundPrompt(scene.background_scene || 'indoor_general');
          const bgResult = await generators.generate({
            character_slug: 'background',
            action_label: scene.background_scene || 'indoor_general',
            asset_type: 'background_interaction',
            prompt: bgPrompt,
          });
          episodes.updateScene(scene.id, { image_asset_ref: bgResult.asset_ref });
          buildLog.steps.push({ step: 'background', scene: scene.title, asset_ref: bgResult.asset_ref });
        } catch (e) {
          buildLog.steps.push({ step: 'background', scene: scene.title, error: e.message });
        }
      }

      // Step 3: Generate audio
      for (const scene of ep.scenes) {
        try {
          const dialogue = typeof scene.dialogue === 'string' ? JSON.parse(scene.dialogue) : scene.dialogue;
          const audioResult = await audio.generateSceneAudio({ narration: scene.narration, dialogue });
          const firstAudio = audioResult.lines.find(l => l.asset_ref);
          if (firstAudio) episodes.updateScene(scene.id, { audio_asset_ref: firstAudio.asset_ref });
          buildLog.steps.push({ step: 'audio', scene: scene.title, total_lines: audioResult.total });
        } catch (e) {
          buildLog.steps.push({ step: 'audio', scene: scene.title, error: e.message });
        }
      }

      // Step 4: Assemble videos
      const assembledVideos = [];
      for (const scene of ep.scenes) {
        const updated = db.prepare('SELECT * FROM scenes WHERE id = ?').get(scene.id);
        if (updated.image_asset_ref) {
          try {
            const vidResult = await assembler.assembleScene({
              image_ref: updated.image_asset_ref,
              audio_ref: updated.audio_asset_ref,
              duration: req.body.scene_duration || 5,
              scene_id: scene.id,
            });
            episodes.updateScene(scene.id, { video_asset_ref: vidResult.asset_ref, status: 'assembled' });
            assembledVideos.push({ asset_ref: vidResult.asset_ref, duration: vidResult.metadata.duration || 5 });
            buildLog.steps.push({ step: 'video', scene: scene.title, asset_ref: vidResult.asset_ref });
          } catch (e) {
            buildLog.steps.push({ step: 'video', scene: scene.title, error: e.message });
          }
        }
      }

      // Step 5: Concatenate into final episode
      let finalVideo = null;
      if (assembledVideos.length > 0) {
        try {
          finalVideo = await assembler.assembleEpisode(assembledVideos, ep.slug);
          episodes.updateEpisode(ep.id, { status: 'assembled', metadata: { ...ep.metadata, final_video: finalVideo.asset_ref } });
          buildLog.steps.push({ step: 'final', asset_ref: finalVideo.asset_ref });
        } catch (e) {
          buildLog.steps.push({ step: 'final', error: e.message });
        }
      }

      episodes.updateEpisode(ep.id, { status: 'built' });
      res.json({ episode: episodes.getEpisode(ep.id), build_log: buildLog });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- Pipeline status ---

  router.get('/pipeline/status', (req, res) => {
    try {
      res.json({
        generators: generators ? { available: true } : { available: false },
        tts: audio.getStatus(),
        assembler: { available: assembler.isConfigured() },
        background_scenes: PromptBuilder.getBackgroundScenes(),
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}
