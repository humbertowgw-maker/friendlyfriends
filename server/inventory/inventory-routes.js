import { Router } from 'express';
import { CharacterInventory } from './character-inventory.js';
import { PipelineHook } from './pipeline-hook.js';
import { BookIngestion } from './book-ingestion.js';
import { VideoPipeline } from './video-pipeline.js';

export function createInventoryRoutes(db, generators) {
  const router = Router();
  const inventory = new CharacterInventory(db);
  const pipeline = new PipelineHook(inventory);
  const ingestion = new BookIngestion(db, inventory);
  const videoPipeline = new VideoPipeline(inventory, generators);
  videoPipeline.setHook(pipeline);

  // --- Characters ---

  router.get('/characters', (req, res) => {
    try {
      const characters = inventory.getAllCharacters();
      res.json(characters);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/characters/:id', (req, res) => {
    try {
      const character = inventory.getCharacter(Number(req.params.id));
      if (!character) return res.status(404).json({ error: 'Character not found' });
      character.assets = inventory.getAssets(character.id);
      character.stats = {
        total_assets: character.assets.length,
        types: character.assets.reduce((acc, a) => {
          acc[a.type] = (acc[a.type] || 0) + 1;
          return acc;
        }, {}),
      };
      res.json(character);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/characters', (req, res) => {
    try {
      const { name, slug, description, reference_images } = req.body;
      if (!name || !slug) return res.status(400).json({ error: 'name and slug are required' });
      const existing = inventory.getCharacterBySlug(slug);
      if (existing) return res.status(409).json({ error: 'Character with this slug already exists' });
      const character = inventory.createCharacter({ name, slug, description, reference_images });
      res.status(201).json(character);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.put('/characters/:id', (req, res) => {
    try {
      const updated = inventory.updateCharacter(Number(req.params.id), req.body);
      if (!updated) return res.status(404).json({ error: 'Character not found' });
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- Animation Assets ---

  router.get('/characters/:id/assets', (req, res) => {
    try {
      const character = inventory.getCharacter(Number(req.params.id));
      if (!character) return res.status(404).json({ error: 'Character not found' });
      const assets = inventory.getAssets(character.id, { type: req.query.type });
      res.json(assets);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/characters/:id/assets/lookup', (req, res) => {
    try {
      const character = inventory.getCharacter(Number(req.params.id));
      if (!character) return res.status(404).json({ error: 'Character not found' });
      const { label, type } = req.query;
      if (!label) return res.status(400).json({ error: 'label query param is required' });
      const asset = inventory.lookupAsset(character.id, label, type || null);
      if (!asset) return res.status(404).json({ error: 'No matching asset found', found: false });
      res.json({ ...asset, found: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/characters/:id/assets', (req, res) => {
    try {
      const character = inventory.getCharacter(Number(req.params.id));
      if (!character) return res.status(404).json({ error: 'Character not found' });
      const { type, label, asset_ref, metadata, source } = req.body;
      if (!type || !label || !asset_ref) {
        return res.status(400).json({ error: 'type, label, and asset_ref are required' });
      }
      const asset = inventory.createAsset(character.id, { type, label, asset_ref, metadata, source });
      res.status(201).json(asset);
    } catch (e) {
      if (e.message?.includes('UNIQUE')) {
        return res.status(409).json({ error: 'Asset with this type+label already exists for this character' });
      }
      res.status(500).json({ error: e.message });
    }
  });

  // --- Pipeline resolution ---

  router.post('/pipeline/resolve', async (req, res) => {
    try {
      const { character_id, label, type } = req.body;
      if (!character_id || !label || !type) {
        return res.status(400).json({ error: 'character_id, label, and type are required' });
      }
      const generateFn = PipelineHook.stubGenerator(label, type);
      const result = await pipeline.resolveAsset(character_id, label, type, generateFn);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- Book ingestion ---

  router.post('/ingest', async (req, res) => {
    try {
      const { chunks, autoGenerate = false } = req.body;
      if (!chunks || !Array.isArray(chunks) || chunks.length === 0) {
        return res.status(400).json({ error: 'chunks array is required' });
      }
      const generateFn = autoGenerate
        ? async (charId, label, type) => {
            const gen = PipelineHook.stubGenerator(label, type);
            return await gen();
          }
        : null;
      const results = await ingestion.ingestBatch(chunks, { autoGenerate, generateFn });
      res.json({ ingested: results.length, results });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- Inventory gaps ---

  router.get('/gaps', (req, res) => {
    try {
      const gaps = inventory.getGaps({
        status: req.query.status || null,
        character_id: req.query.character_id ? Number(req.query.character_id) : null,
      });
      res.json(gaps);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/gaps/:id/resolve', (req, res) => {
    try {
      inventory.resolveGap(Number(req.params.id));
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/gaps/:id/ignore', (req, res) => {
    try {
      inventory.ignoreGap(Number(req.params.id));
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- Video pipeline ---

  router.post('/pipeline/generate-scene', async (req, res) => {
    try {
      const { title, actions } = req.body;
      if (!actions || !Array.isArray(actions) || actions.length === 0) {
        return res.status(400).json({ error: 'actions array is required' });
      }
      // Use real generators if available, otherwise stub
      const generateFn = generators
        ? async (slug, label, type) => await generators.generate({ character_slug: slug, action_label: label, asset_type: type })
        : async (slug, label, type) => await VideoPipeline.stubGenerator(label, type)();
      const result = await videoPipeline.generateScene({ title: title || 'Untitled Scene', actions }, generateFn);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/pipeline/process-episode', async (req, res) => {
    try {
      const { title, scenes } = req.body;
      if (!scenes || !Array.isArray(scenes) || scenes.length === 0) {
        return res.status(400).json({ error: 'scenes array is required' });
      }
      const generateFn = generators
        ? async (slug, label, type) => await generators.generate({ character_slug: slug, action_label: label, asset_type: type })
        : async (slug, label, type) => await VideoPipeline.stubGenerator(label, type)();
      const result = await videoPipeline.processEpisode({ title: title || 'Untitled Episode', scenes }, generateFn);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- Generators ---

  router.get('/generators/status', async (req, res) => {
    try {
      if (!generators) return res.json({ configured: false, adapters: [] });
      const status = await generators.getStatus();
      res.json({ configured: true, adapters: status, stats: generators.getStats(), history: generators.getHistory(20) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- Stats ---

  router.get('/stats', (req, res) => {
    try {
      const stats = inventory.getStats();
      res.json(stats);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}
