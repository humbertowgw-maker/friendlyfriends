import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PipelineHook } from './pipeline-hook.js';

/**
 * Fake CharacterInventory backed by an in-memory Map, exposing only the
 * methods PipelineHook actually calls. Keeps this a unit test of the
 * inventory-first resolution logic, not an integration test of sql.js.
 */
function makeFakeInventory({ existingAssets = [], gaps = [] } = {}) {
  const assets = new Map(existingAssets.map(a => [a.id, { ...a }]));
  let nextId = existingAssets.length + 1;
  const resolvedGapIds = [];

  return {
    _assets: assets,
    _resolvedGapIds: resolvedGapIds,
    lookupAsset: vi.fn((characterId, label, type) => {
      for (const asset of assets.values()) {
        if (asset.character_id === characterId && asset.label === label && asset.type === type) {
          return asset;
        }
      }
      return undefined;
    }),
    incrementAssetUse: vi.fn((assetId) => {
      const asset = assets.get(assetId);
      asset.use_count = (asset.use_count || 0) + 1;
      return asset;
    }),
    createAsset: vi.fn((characterId, { type, label, asset_ref, metadata, source }) => {
      const asset = { id: nextId++, character_id: characterId, type, label, asset_ref, metadata, source, use_count: 0 };
      assets.set(asset.id, asset);
      return asset;
    }),
    getGaps: vi.fn(({ status, character_id } = {}) =>
      gaps.filter(g => (!status || g.status === status) && (!character_id || g.character_id === character_id))
    ),
    resolveGap: vi.fn((id) => { resolvedGapIds.push(id); }),
  };
}

describe('PipelineHook.resolveAsset (inventory-first asset resolution)', () => {
  let generateFn;

  beforeEach(() => {
    generateFn = vi.fn(async () => ({ asset_ref: 'assets/new.png', metadata: { generator: 'test' } }));
  });

  it('reuses an existing asset and never calls the generator', async () => {
    const inventory = makeFakeInventory({
      existingAssets: [{ id: 1, character_id: 7, type: 'pose', label: 'sitting', asset_ref: 'assets/existing.png', use_count: 3 }],
    });
    const hook = new PipelineHook(inventory);

    const { asset, reused } = await hook.resolveAsset(7, 'sitting', 'pose', generateFn);

    expect(reused).toBe(true);
    expect(asset.asset_ref).toBe('assets/existing.png');
    expect(generateFn).not.toHaveBeenCalled();
    expect(inventory.incrementAssetUse).toHaveBeenCalledWith(1);
    expect(inventory.createAsset).not.toHaveBeenCalled();
  });

  it('generates a new asset only when nothing matches in inventory', async () => {
    const inventory = makeFakeInventory();
    const hook = new PipelineHook(inventory);

    const { asset, reused } = await hook.resolveAsset(7, 'waving', 'pose', generateFn);

    expect(reused).toBe(false);
    expect(generateFn).toHaveBeenCalledTimes(1);
    expect(asset.asset_ref).toBe('assets/new.png');
    expect(inventory.createAsset).toHaveBeenCalledWith(7, expect.objectContaining({
      type: 'pose', label: 'waving', asset_ref: 'assets/new.png', source: 'generated',
    }));
  });

  it('does not confuse assets across different characters or asset types', async () => {
    const inventory = makeFakeInventory({
      existingAssets: [
        { id: 1, character_id: 1, type: 'pose', label: 'sitting', asset_ref: 'assets/char1-sitting.png', use_count: 0 },
        { id: 2, character_id: 7, type: 'expression', label: 'sitting', asset_ref: 'assets/char7-sitting-expr.png', use_count: 0 },
      ],
    });
    const hook = new PipelineHook(inventory);

    // Same label "sitting", different character and different type than what's cached — must regenerate.
    const { reused } = await hook.resolveAsset(7, 'sitting', 'pose', generateFn);

    expect(reused).toBe(false);
    expect(generateFn).toHaveBeenCalledTimes(1);
  });

  it('auto-resolves matching pending gaps after generating a new asset', async () => {
    const inventory = makeFakeInventory({
      gaps: [
        { id: 100, character_id: 7, requested_label: 'waving', asset_type: 'pose', status: 'pending' },
        { id: 101, character_id: 7, requested_label: 'sitting', asset_type: 'pose', status: 'pending' },
      ],
    });
    const hook = new PipelineHook(inventory);

    await hook.resolveAsset(7, 'waving', 'pose', generateFn);

    expect(inventory.resolveGap).toHaveBeenCalledWith(100);
    expect(inventory.resolveGap).not.toHaveBeenCalledWith(101);
  });

  it('does not touch gaps when reusing an existing asset', async () => {
    const inventory = makeFakeInventory({
      existingAssets: [{ id: 1, character_id: 7, type: 'pose', label: 'sitting', asset_ref: 'assets/existing.png', use_count: 0 }],
      gaps: [{ id: 100, character_id: 7, requested_label: 'sitting', asset_type: 'pose', status: 'pending' }],
    });
    const hook = new PipelineHook(inventory);

    await hook.resolveAsset(7, 'sitting', 'pose', generateFn);

    expect(inventory.getGaps).not.toHaveBeenCalled();
    expect(inventory.resolveGap).not.toHaveBeenCalled();
  });

  it('resolveAssets batches multiple requests, reusing and generating as appropriate per-request', async () => {
    const inventory = makeFakeInventory({
      existingAssets: [{ id: 1, character_id: 7, type: 'pose', label: 'sitting', asset_ref: 'assets/existing.png', use_count: 0 }],
    });
    const hook = new PipelineHook(inventory);
    const genA = vi.fn(async () => ({ asset_ref: 'assets/waving.png', metadata: {} }));

    const results = await hook.resolveAssets([
      { characterId: 7, label: 'sitting', type: 'pose', generateFn: vi.fn() }, // should reuse; generateFn must not run
      { characterId: 7, label: 'waving', type: 'pose', generateFn: genA },
    ]);

    expect(results[0].reused).toBe(true);
    expect(results[1].reused).toBe(false);
    expect(genA).toHaveBeenCalledTimes(1);
  });
});
