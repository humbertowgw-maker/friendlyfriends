import { useState, useEffect } from 'react';
import {
  fetchInventoryCharacters,
  fetchInventoryCharacter,
  fetchInventoryStats,
  fetchInventoryAssets,
  fetchInventoryGaps,
  ingestBookContent,
  resolveGap,
  ignoreGap,
  generateScene,
  registerAsset,
  fetchGeneratorStatus,
  createCharacter,
  updateCharacter,
  fetchPoseOptions,
  generatePose,
  fetchAssets,
  deleteAsset,
  batchGenerate,
  fetchBatchJob,
} from '../lib/api.js';

export function InventoryPanel() {
  const [tab, setTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [characters, setCharacters] = useState([]);
  const [selectedChar, setSelectedChar] = useState(null);
  const [charDetail, setCharDetail] = useState(null);
  const [gaps, setGaps] = useState([]);
  const [filterType, setFilterType] = useState('');
  const [ingestText, setIngestText] = useState('');
  const [ingestResult, setIngestResult] = useState(null);
  const [sceneText, setSceneText] = useState('');
  const [sceneResult, setSceneResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generators, setGenerators] = useState(null);
  const [showCharForm, setShowCharForm] = useState(false);
  const [editingChar, setEditingChar] = useState(null);
  const [charForm, setCharForm] = useState({ name: '', slug: '', description: '' });
  const [poseOptions, setPoseOptions] = useState(null);
  const [poseForm, setPoseForm] = useState({ character_slug: 'achilles', action_label: 'sitting', background: '' });
  const [poseResult, setPoseResult] = useState(null);
  const [poseLoading, setPoseLoading] = useState(false);
  const [allAssets, setAllAssets] = useState(null);
  const [assetFilter, setAssetFilter] = useState('');
  const [previewAsset, setPreviewAsset] = useState(null);
  const [batchChars, setBatchChars] = useState(['achilles']);
  const [batchPoses, setBatchPoses] = useState(['sitting']);
  const [batchBgs, setBatchBgs] = useState([]);
  const [batchJob, setBatchJob] = useState(null);
  const [batchProgress, setBatchProgress] = useState(null);

  useEffect(() => {
    loadOverview();
  }, []);

  const loadOverview = async () => {
    setLoading(true);
    try {
      const [s, c, g, gen] = await Promise.all([
        fetchInventoryStats(),
        fetchInventoryCharacters(),
        fetchInventoryGaps(),
        fetchGeneratorStatus(),
      ]);
      setStats(s);
      setCharacters(c);
      setGaps(g);
      setGenerators(gen);
    } catch {}
    setLoading(false);
  };

  const loadCharacter = async (id) => {
    setSelectedChar(id);
    try {
      const detail = await fetchInventoryCharacter(id);
      setCharDetail(detail);
    } catch {}
  };

  const handleIngest = async () => {
    if (!ingestText.trim()) return;
    try {
      const chunks = [{
        source_id: `manual-${Date.now()}`,
        source_type: 'script',
        content_text: ingestText,
      }];
      const result = await ingestBookContent(chunks);
      setIngestResult(result);
      setIngestText('');
      loadOverview();
    } catch {}
  };

  const handleScene = async () => {
    if (!sceneText.trim()) return;
    try {
      const actions = sceneText.split('\n').filter(l => l.trim()).map(line => {
        const [slug, ...rest] = line.split(':');
        return {
          character_slug: slug.trim().toLowerCase(),
          action_label: rest.join(':').trim(),
        };
      });
      const result = await generateScene({ title: 'Manual Scene', actions });
      setSceneResult(result);
      loadOverview();
    } catch {}
  };

  const handleResolveGap = async (id) => {
    await resolveGap(id);
    setGaps(await fetchInventoryGaps());
    setStats(await fetchInventoryStats());
  };

  const handleIgnoreGap = async (id) => {
    await ignoreGap(id);
    setGaps(await fetchInventoryGaps());
  };

  const handleCreateChar = async () => {
    if (!charForm.name || !charForm.slug) return;
    await createCharacter(charForm);
    setCharForm({ name: '', slug: '', description: '' });
    setShowCharForm(false);
    const chars = await fetchInventoryCharacters();
    setCharacters(chars);
  };

  const handleUpdateChar = async () => {
    if (!editingChar) return;
    await updateCharacter(editingChar.id, charForm);
    setEditingChar(null);
    setShowCharForm(false);
    const chars = await fetchInventoryCharacters();
    setCharacters(chars);
    if (selectedChar === editingChar.id) {
      loadCharacter(editingChar.id);
    }
  };

  const startEditChar = (char) => {
    setEditingChar(char);
    setCharForm({ name: char.name, slug: char.slug, description: char.description || '' });
    setShowCharForm(true);
  };

  const loadPoseOptions = async () => {
    if (!poseOptions) {
      const opts = await fetchPoseOptions();
      setPoseOptions(opts);
    }
  };

  const handleGeneratePose = async () => {
    setPoseLoading(true);
    setPoseResult(null);
    try {
      const result = await generatePose({
        character_slug: poseForm.character_slug,
        action_label: poseForm.action_label,
        background: poseForm.background || undefined,
        register_as_asset: true,
      });
      setPoseResult(result);
      setStats(await fetchInventoryStats());
    } catch (e) {
      setPoseResult({ error: e.message });
    }
    setPoseLoading(false);
  };

  const loadAssets = async () => {
    const data = await fetchAssets();
    setAllAssets(data);
  };

  const handleDeleteAsset = async (type, filename) => {
    if (!confirm(`Delete ${filename}?`)) return;
    await deleteAsset(type, filename);
    setPreviewAsset(null);
    loadAssets();
  };

  const handleBatchGenerate = async () => {
    if (!batchChars.length || !batchPoses.length) return;
    const total = batchChars.length * batchPoses.length * (batchBgs.length || 1);
    if (total > 50) {
      if (!confirm(`This will generate ${total} images. Continue?`)) return;
    }
    setBatchProgress({ total, completed: 0, succeeded: 0, failed: 0, running: true });
    try {
      const result = await batchGenerate({
        characters: batchChars,
        poses: batchPoses,
        backgrounds: batchBgs.length ? batchBgs : undefined,
        register_assets: true,
      });
      const poll = async () => {
        const job = await fetchBatchJob(result.jobId);
        setBatchProgress({ ...job, running: job.completed < job.total });
        if (job.completed < job.total) {
          setTimeout(poll, 1000);
        } else {
          setStats(await fetchInventoryStats());
          loadAssets();
        }
      };
      setTimeout(poll, 1500);
    } catch (e) {
      setBatchProgress({ error: e.message, running: false });
    }
  };

  const toggleBatchItem = (arr, setArr, item) => {
    setArr(arr.includes(item) ? arr.filter(i => i !== item) : [...arr, item]);
  };

  const pendingGaps = gaps.filter(g => g.status === 'pending');
  const typeIcons = { pose: 'P', movement_cycle: 'M', expression: 'E', voice_line: 'V', background_interaction: 'B' };

  return (
    <div>
      <div style={styles.tabBar}>
        {['overview', 'characters', 'generate', 'assets', 'gaps', 'ingest', 'pipeline'].map(t => (
          <button
            key={t}
            style={{ ...styles.tabBtn, ...(tab === t ? styles.tabBtnActive : {}) }}
            onClick={() => { setTab(t); if (t === 'generate') loadPoseOptions(); if (t === 'assets') loadAssets(); }}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'overview' && !loading && stats && (
        <div>
          <div style={styles.statsGrid}>
            <div style={styles.statCard}>
              <div style={styles.statNum}>{stats.characters}</div>
              <div style={styles.statLbl}>Characters</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statNum}>{stats.total_assets}</div>
              <div style={styles.statLbl}>Total Assets</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statNum}>{stats.episodes || 0}</div>
              <div style={styles.statLbl}>Episodes</div>
            </div>
            <div style={styles.statCard}>
              <div style={{ ...styles.statNum, color: pendingGaps.length > 0 ? '#eab308' : '#4ade80' }}>{stats.pending_gaps}</div>
              <div style={styles.statLbl}>Pending Gaps</div>
            </div>
          </div>

          {stats.character_assets && stats.character_assets.length > 0 && (
            <div style={styles.card}>
              <h4 style={styles.cardTitle}>Character Coverage</h4>
              <div style={styles.heatmap}>
                <div style={styles.heatmapHeader}>
                  <span style={styles.heatmapName}></span>
                  <span style={styles.heatmapCell}>Pose</span>
                  <span style={styles.heatmapCell}>Expr</span>
                  <span style={styles.heatmapCell}>Move</span>
                  <span style={styles.heatmapCell}>Scene</span>
                  <span style={styles.heatmapCell}>Total</span>
                </div>
                {stats.character_assets.map(c => (
                  <div key={c.slug} style={styles.heatmapRow}>
                    <span style={styles.heatmapName}>{c.name}</span>
                    <span style={{ ...styles.heatmapCell, ...(c.poses > 0 ? styles.heatmapFilled : {}) }}>{c.poses || 0}</span>
                    <span style={{ ...styles.heatmapCell, ...(c.expressions > 0 ? styles.heatmapFilled : {}) }}>{c.expressions || 0}</span>
                    <span style={{ ...styles.heatmapCell, ...(c.movements > 0 ? styles.heatmapFilled : {}) }}>{c.movements || 0}</span>
                    <span style={{ ...styles.heatmapCell, ...(c.scenes > 0 ? styles.heatmapFilled : {}) }}>{c.scenes || 0}</span>
                    <span style={{ ...styles.heatmapCell, fontWeight: 700 }}>{c.asset_count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {stats.asset_type_breakdown.length > 0 && (
            <div style={styles.card}>
              <h4 style={styles.cardTitle}>Asset Breakdown</h4>
              {stats.asset_type_breakdown.map(t => (
                <div key={t.type} style={styles.breakdownRow}>
                  <span style={styles.breakdownType}>{typeIcons[t.type] || '?'} {t.type}</span>
                  <div style={styles.breakdownBar}>
                    <div style={{ ...styles.breakdownFill, width: `${(t.count / stats.total_assets) * 100}%` }} />
                  </div>
                  <span style={styles.breakdownCount}>{t.count}</span>
                </div>
              ))}
            </div>
          )}

          {generators && generators.configured && (
            <div style={styles.card}>
              <h4 style={styles.cardTitle}>Pipeline Health</h4>
              {generators.adapters.map(a => (
                <div key={a.name} style={styles.healthRow}>
                  <span style={{ ...styles.healthDot, background: a.status === 'online' ? '#4ade80' : a.status === 'configured' ? '#eab308' : '#ef4444' }} />
                  <span style={styles.healthName}>{a.name}</span>
                  <span style={{ color: a.status === 'online' ? '#4ade80' : a.status === 'configured' ? '#eab308' : '#8888a0', fontSize: 11 }}>
                    {a.status}{a.mode ? ` (${a.mode})` : ''}
                  </span>
                </div>
              ))}
              {generators.stats.total > 0 && (
                <div style={{ marginTop: 8, fontSize: 11, color: '#8888a0' }}>
                  {generators.stats.total} generated this session
                  {Object.entries(generators.stats.by_generator).map(([name, count]) => (
                    <span key={name}> | {name}: {count}</span>
                  ))}
                </div>
              )}
            </div>
          )}
          {generators && !generators.configured && (
            <div style={styles.card}>
              <h4 style={styles.cardTitle}>Pipeline Health</h4>
              <p style={styles.dim}>No generators configured. Add SD_WEBUI_URL, COMFYUI_URL, or HF_API_TOKEN to .env</p>
              <p style={styles.dim}>Pollinations.ai is always available as a free fallback.</p>
            </div>
          )}
        </div>
      )}

      {tab === 'characters' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button style={styles.primaryBtn} onClick={() => { setEditingChar(null); setCharForm({ name: '', slug: '', description: '' }); setShowCharForm(true); }}>+ New Character</button>
          </div>
          {showCharForm && (
            <div style={styles.card}>
              <h4 style={styles.cardTitle}>{editingChar ? 'Edit Character' : 'New Character'}</h4>
              <input style={styles.input} placeholder="Name" value={charForm.name} onChange={e => setCharForm({ ...charForm, name: e.target.value, slug: editingChar ? charForm.slug : e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') })} />
              <input style={styles.input} placeholder="Slug" value={charForm.slug} onChange={e => setCharForm({ ...charForm, slug: e.target.value })} disabled={!!editingChar} />
              <textarea style={styles.textarea} rows={2} placeholder="Description (traits, appearance)" value={charForm.description} onChange={e => setCharForm({ ...charForm, description: e.target.value })} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={styles.primaryBtn} onClick={editingChar ? handleUpdateChar : handleCreateChar}>{editingChar ? 'Update' : 'Create'}</button>
                <button style={styles.secondaryBtn} onClick={() => { setShowCharForm(false); setEditingChar(null); }}>Cancel</button>
              </div>
            </div>
          )}
          <div style={styles.charLayout}>
          <div style={styles.charList}>
            {characters.map(c => (
              <div
                key={c.id}
                style={{ ...styles.charItem, ...(selectedChar === c.id ? styles.charItemActive : {}) }}
                onClick={() => loadCharacter(c.id)}
              >
                <div style={styles.charName}>{c.name}</div>
                <div style={styles.charSlug}>{c.slug}</div>
              </div>
            ))}
          </div>
          <div style={styles.charDetail}>
            {charDetail ? (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <h3 style={styles.detailName}>{charDetail.name}</h3>
                  <button style={styles.secondaryBtn} onClick={() => startEditChar(charDetail)}>Edit</button>
                </div>
                <p style={styles.detailDesc}>{charDetail.description}</p>
                <div style={styles.detailStats}>
                  <span>{charDetail.stats.total_assets} assets</span>
                  {Object.entries(charDetail.stats.types || {}).map(([type, count]) => (
                    <span key={type} style={styles.typeBadge}>{count}x {type}</span>
                  ))}
                </div>
                <h4 style={styles.cardTitle}>Assets</h4>
                <div style={styles.filterRow}>
                  <select style={styles.select} value={filterType} onChange={e => setFilterType(e.target.value)}>
                    <option value="">All types</option>
                    <option value="pose">Pose</option>
                    <option value="movement_cycle">Movement</option>
                    <option value="expression">Expression</option>
                    <option value="voice_line">Voice</option>
                  </select>
                </div>
                {charDetail.assets
                  .filter(a => !filterType || a.type === filterType)
                  .map(a => (
                    <div key={a.id} style={styles.assetRow}>
                      <span style={styles.assetType}>{typeIcons[a.type] || '?'}</span>
                      <div style={styles.assetInfo}>
                        <span style={styles.assetLabel}>{a.label}</span>
                        <span style={styles.assetMeta}>{a.asset_ref}</span>
                      </div>
                      <span style={styles.assetUses}>{a.use_count} uses</span>
                    </div>
                  ))
                }
                {charDetail.assets.length === 0 && <p style={styles.dim}>No assets yet</p>}
              </div>
            ) : (
              <p style={styles.dim}>Select a character</p>
            )}
          </div>
        </div>
        </div>
      )}

      {tab === 'generate' && (
        <div>
          {poseOptions ? (
            <div style={styles.card}>
              <h4 style={styles.cardTitle}>Generate Character Pose</h4>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                <div>
                  <label style={styles.dim}>Character</label>
                  <select style={styles.select} value={poseForm.character_slug} onChange={e => setPoseForm({ ...poseForm, character_slug: e.target.value })}>
                    {poseOptions.characters.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={styles.dim}>Pose</label>
                  <select style={styles.select} value={poseForm.action_label} onChange={e => setPoseForm({ ...poseForm, action_label: e.target.value })}>
                    {poseOptions.poses.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label style={styles.dim}>Background (optional)</label>
                  <select style={styles.select} value={poseForm.background} onChange={e => setPoseForm({ ...poseForm, background: e.target.value })}>
                    <option value="">None (character only)</option>
                    {poseOptions.backgrounds.map(b => <option key={b} value={b}>{b.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
              </div>
              <button
                style={{ ...styles.primaryBtn, opacity: poseLoading ? 0.5 : 1 }}
                onClick={handleGeneratePose}
                disabled={poseLoading}
              >
                {poseLoading ? 'Generating...' : 'Generate'}
              </button>
              {poseResult && (
                <div style={{ marginTop: 16 }}>
                  {poseResult.error ? (
                    <p style={{ color: '#ef4444', fontSize: 12 }}>{poseResult.error}</p>
                  ) : (
                    <div>
                      <div style={styles.dim}>
                        Generated with <strong>{poseResult.generator}</strong>
                        {poseResult.asset && <span> — registered as asset</span>}
                      </div>
                      {poseResult.asset_ref && (
                        <img
                          src={`/assets/${poseResult.asset_ref}`}
                          alt={poseResult.asset_ref}
                          style={{ maxWidth: '100%', maxHeight: 400, borderRadius: 8, marginTop: 8, border: '1px solid #2a2a3a' }}
                        />
                      )}
                      {poseResult.metadata?.prompt && (
                        <div style={{ marginTop: 8, padding: 10, background: '#1a1a25', borderRadius: 6, fontSize: 11, color: '#8888a0', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                          {poseResult.metadata.prompt}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p style={styles.dim}>Loading pose options...</p>
          )}

          {poseOptions && (
            <div style={styles.card}>
              <h4 style={styles.cardTitle}>Batch Generate</h4>
              <p style={{ ...styles.dim, marginBottom: 10 }}>Select multiple characters, poses, and backgrounds to generate all combinations at once.</p>

              <div style={{ marginBottom: 10 }}>
                <label style={styles.dim}>Characters</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  {poseOptions.characters.map(c => (
                    <button key={c} style={{ ...styles.filterBtn, ...(batchChars.includes(c) ? styles.filterBtnActive : {}) }} onClick={() => toggleBatchItem(batchChars, setBatchChars, c)}>{c}</button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 10 }}>
                <label style={styles.dim}>Poses</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  {poseOptions.poses.map(p => (
                    <button key={p} style={{ ...styles.filterBtn, ...(batchPoses.includes(p) ? styles.filterBtnActive : {}) }} onClick={() => toggleBatchItem(batchPoses, setBatchPoses, p)}>{p}</button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={styles.dim}>Backgrounds (optional — leave empty for character-only)</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  {poseOptions.backgrounds.map(b => (
                    <button key={b} style={{ ...styles.filterBtn, ...(batchBgs.includes(b) ? styles.filterBtnActive : {}) }} onClick={() => toggleBatchItem(batchBgs, setBatchBgs, b)}>{b.replace(/_/g, ' ')}</button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  style={{ ...styles.primaryBtn, opacity: batchProgress?.running ? 0.5 : 1 }}
                  onClick={handleBatchGenerate}
                  disabled={batchProgress?.running}
                >
                  {batchProgress?.running ? 'Generating...' : `Generate ${batchChars.length * batchPoses.length * (batchBgs.length || 1)} images`}
                </button>
                {batchProgress && !batchProgress.running && !batchProgress.error && (
                  <span style={styles.dim}>Done: {batchProgress.succeeded} succeeded, {batchProgress.failed} failed</span>
                )}
              </div>

              {batchProgress && (
                <div style={{ marginTop: 12 }}>
                  <div style={styles.progressBar}>
                    <div style={{ ...styles.progressFill, width: `${(batchProgress.completed / batchProgress.total) * 100}%` }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                    <span style={styles.dim}>{batchProgress.completed} / {batchProgress.total}</span>
                    <span style={styles.dim}>{Math.round((batchProgress.completed / batchProgress.total) * 100)}%</span>
                  </div>
                  {batchProgress.errors?.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      {batchProgress.errors.map((e, i) => (
                        <div key={i} style={{ fontSize: 11, color: '#ef4444' }}>{e.slug}/{e.pose}: {e.error}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {poseOptions && (
            <div style={styles.card}>
              <h4 style={styles.cardTitle}>Expressions Pack</h4>
              <p style={{ ...styles.dim, marginBottom: 10 }}>Generate a full expression library for all characters. One click generates happy, sad, excited, scared, and curious expressions for each character.</p>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                {['happy', 'sad', 'excited', 'scared', 'curious'].map(expr => (
                  <span key={expr} style={styles.exprChip}>{expr}</span>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  style={{ ...styles.primaryBtn, opacity: batchProgress?.running ? 0.5 : 1 }}
                  onClick={() => {
                    setBatchChars(poseOptions.characters);
                    setBatchPoses(['happy', 'sad', 'excited', 'scared', 'curious']);
                    setBatchBgs([]);
                    handleBatchGenerate();
                  }}
                  disabled={batchProgress?.running}
                >
                  {batchProgress?.running ? 'Generating...' : `Generate ${poseOptions.characters.length * 5} expressions`}
                </button>
                <span style={styles.dim}>{poseOptions.characters.length} characters × 5 expressions = {poseOptions.characters.length * 5} images</span>
              </div>
            </div>
          )}
        </div>
      )}
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
            <span style={styles.dim}>{allAssets?.total || 0} assets</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {['', 'image', 'audio', 'video'].map(t => (
                <button
                  key={t}
                  style={{ ...styles.filterBtn, ...(assetFilter === t ? styles.filterBtnActive : {}) }}
                  onClick={() => setAssetFilter(t)}
                >
                  {t || 'All'}
                </button>
              ))}
            </div>
            <button style={styles.secondaryBtn} onClick={loadAssets}>Refresh</button>
          </div>
          {allAssets ? (
            <div style={styles.assetGrid}>
              {allAssets.assets
                .filter(a => !assetFilter || a.type === assetFilter)
                .map(asset => (
                  <div key={asset.id} style={styles.assetCard} onClick={() => setPreviewAsset(asset)}>
                    {asset.type === 'image' && (
                      <img src={`/assets/${asset.path}`} alt={asset.filename} style={styles.assetThumb} />
                    )}
                    {asset.type === 'audio' && (
                      <div style={styles.assetThumbAudio}>
                        <span style={{ fontSize: 24, color: '#6366f1' }}>AU</span>
                      </div>
                    )}
                    {asset.type === 'video' && (
                      <div style={styles.assetThumbVideo}>
                        <span style={{ fontSize: 24, color: '#4ade80' }}>VD</span>
                      </div>
                    )}
                    <div style={styles.assetInfo}>
                      <span style={styles.assetName} title={asset.filename}>{asset.filename.length > 24 ? asset.filename.slice(0, 24) + '...' : asset.filename}</span>
                      <span style={styles.assetMeta}>{asset.type} &middot; {(asset.size / 1024).toFixed(1)}KB</span>
                    </div>
                  </div>
                ))}
              {allAssets.assets.filter(a => !assetFilter || a.type === assetFilter).length === 0 && (
                <p style={styles.dim}>No assets found. Generate some in the Generate tab!</p>
              )}
            </div>
          ) : (
            <p style={styles.dim}>Loading assets...</p>
          )}
        </div>
      )}

      {tab === 'gaps' && (
        <div>
          <div style={styles.gapSummary}>
            <span style={styles.dim}>{pendingGaps.length} pending gap{pendingGaps.length !== 1 ? 's' : ''}</span>
          </div>
          {pendingGaps.length === 0 ? (
            <div style={styles.card}>
              <p style={styles.dim}>No pending gaps — all actions have matching assets</p>
            </div>
          ) : (
            pendingGaps.map(g => (
              <div key={g.id} style={styles.gapRow}>
                <div style={styles.gapInfo}>
                  <span style={styles.gapChar}>{g.character_name}</span>
                  <span style={styles.gapAction}>{typeIcons[g.asset_type] || '?'} {g.requested_label}</span>
                </div>
                <div style={styles.gapActions}>
                  <button style={styles.resolveBtn} onClick={() => handleResolveGap(g.id)}>Resolve</button>
                  <button style={styles.ignoreBtn} onClick={() => handleIgnoreGap(g.id)}>Ignore</button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'ingest' && (
        <div>
          <div style={styles.card}>
            <h4 style={styles.cardTitle}>Ingest Script Content</h4>
            <p style={styles.dim}>Paste your script text. The system will detect characters, extract actions, and flag missing assets.</p>
            <textarea
              style={styles.textarea}
              rows={6}
              placeholder="Achilles sits happily while Henry walks across the room and Peter sings a cheerful song..."
              value={ingestText}
              onChange={e => setIngestText(e.target.value)}
            />
            <button style={styles.primaryBtn} onClick={handleIngest}>Analyze Script</button>
          </div>
          {ingestResult && (
            <div style={styles.card}>
              <h4 style={styles.cardTitle}>Ingestion Result</h4>
              {ingestResult.results.map((r, i) => (
                <div key={i}>
                  <p style={styles.dim}>Characters detected: {r.detectedCharacters.map(c => c.name).join(', ') || 'none'}</p>
                  <p style={styles.dim}>Actions found: {r.detectedActions.map(a => a.label).join(', ') || 'none'}</p>
                  <p style={styles.dim}>Gaps created: {r.gaps.length}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'pipeline' && (
        <div>
          <div style={styles.card}>
            <h4 style={styles.cardTitle}>Test Pipeline — Generate Scene</h4>
            <p style={styles.dim}>Enter actions as "character_slug: action_label" per line. Existing assets are reused, missing ones are generated and saved.</p>
            <textarea
              style={styles.textarea}
              rows={5}
              placeholder={"achilles: sitting\nhenry: walking\npeter: singing"}
              value={sceneText}
              onChange={e => setSceneText(e.target.value)}
            />
            <button style={styles.primaryBtn} onClick={handleScene}>Generate Scene</button>
          </div>
          {sceneResult && (
            <div style={styles.card}>
              <h4 style={styles.cardTitle}>Pipeline Result</h4>
              <div style={styles.resultSummary}>
                <span style={styles.reusedBadge}>{sceneResult.totalReused} reused</span>
                <span style={styles.generatedBadge}>{sceneResult.totalGenerated} generated</span>
                {sceneResult.totalGaps > 0 && <span style={styles.gapBadge}>{sceneResult.totalGaps} errors</span>}
              </div>
              {sceneResult.scenes.map((s, i) => (
                <div key={i} style={styles.sceneResult}>
                  <div style={styles.sceneTitle}>{s.title}</div>
                  {s.assets.map((a, j) => (
                    <div key={j} style={styles.assetRow}>
                      <span style={{ ...styles.assetType, color: a.reused ? '#4ade80' : '#60a5fa' }}>{a.reused ? 'REUSED' : 'NEW'}</span>
                      <div style={styles.assetInfo}>
                        <span style={styles.assetLabel}>{a.label}</span>
                        <span style={styles.assetMeta}>{a.type}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {previewAsset && (
        <div style={styles.overlay} onClick={() => setPreviewAsset(null)}>
          <div style={styles.previewContainer} onClick={e => e.stopPropagation()}>
            {previewAsset.type === 'image' && <img src={`/assets/${previewAsset.path}`} style={styles.previewImg} />}
            {previewAsset.type === 'audio' && (
              <div style={styles.previewAudio}>
                <audio controls src={`/assets/${previewAsset.path}`} style={{ width: 300 }} />
              </div>
            )}
            {previewAsset.type === 'video' && (
              <video controls src={`/assets/${previewAsset.path}`} style={styles.previewVideo} />
            )}
            <div style={styles.previewInfo}>
              <span style={styles.previewName}>{previewAsset.filename}</span>
              <span style={styles.dim}>{previewAsset.type} &middot; {(previewAsset.size / 1024).toFixed(1)}KB &middot; {new Date(previewAsset.created).toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <a href={`/assets/${previewAsset.path}`} download style={styles.primaryBtn}>Download</a>
              <button style={{ ...styles.secondaryBtn, color: '#ef4444' }} onClick={() => handleDeleteAsset(previewAsset.type, previewAsset.filename)}>Delete</button>
              <button style={styles.secondaryBtn} onClick={() => setPreviewAsset(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  tabBar: { display: 'flex', gap: 4, marginBottom: 16 },
  tabBtn: { padding: '6px 14px', borderRadius: 6, border: '1px solid #2a2a3a', background: 'transparent', color: '#8888a0', cursor: 'pointer', fontSize: 12, fontWeight: 500 },
  tabBtnActive: { background: '#6366f1', color: '#fff', border: '1px solid #6366f1' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 },
  statCard: { background: '#12121a', border: '1px solid #2a2a3a', borderRadius: 10, padding: '16px 12px', textAlign: 'center' },
  statNum: { fontSize: 24, fontWeight: 700, color: '#e4e4ef' },
  statLbl: { fontSize: 11, color: '#8888a0', marginTop: 4 },
  card: { background: '#12121a', border: '1px solid #2a2a3a', borderRadius: 12, padding: 20, marginBottom: 12 },
  cardTitle: { fontSize: 13, fontWeight: 600, marginBottom: 10, color: '#e4e4ef' },
  dim: { color: '#8888a0', fontSize: 12 },
  breakdownRow: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #1a1a25', fontSize: 12 },
  breakdownType: { color: '#e4e4ef', textTransform: 'capitalize' },
  breakdownCount: { color: '#8888a0', fontWeight: 600 },
  charLayout: { display: 'grid', gridTemplateColumns: '200px 1fr', gap: 16 },
  charList: { display: 'flex', flexDirection: 'column', gap: 4 },
  charItem: { padding: '10px 12px', background: '#12121a', border: '1px solid #2a2a3a', borderRadius: 8, cursor: 'pointer' },
  charItemActive: { borderColor: '#6366f1', background: '#1a1a2e' },
  charName: { fontSize: 13, fontWeight: 600, color: '#e4e4ef' },
  charSlug: { fontSize: 11, color: '#8888a0' },
  charDetail: { background: '#12121a', border: '1px solid #2a2a3a', borderRadius: 12, padding: 20 },
  detailName: { fontSize: 18, fontWeight: 700, color: '#e4e4ef', marginBottom: 4 },
  detailDesc: { fontSize: 13, color: '#8888a0', marginBottom: 12 },
  detailStats: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, fontSize: 12, color: '#8888a0' },
  typeBadge: { background: '#1a1a25', padding: '2px 8px', borderRadius: 4 },
  filterRow: { marginBottom: 10 },
  select: { padding: '5px 8px', background: '#1a1a25', border: '1px solid #2a2a3a', borderRadius: 6, color: '#e4e4ef', fontSize: 11 },
  assetRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #1a1a25' },
  assetType: { fontSize: 10, fontWeight: 700, color: '#6366f1', width: 24, textAlign: 'center', background: '#1a1a25', borderRadius: 4, padding: '2px 0' },
  assetInfo: { flex: 1, display: 'flex', flexDirection: 'column' },
  assetLabel: { fontSize: 13, color: '#e4e4ef' },
  assetMeta: { fontSize: 11, color: '#8888a0' },
  assetUses: { fontSize: 11, color: '#8888a0' },
  gapSummary: { marginBottom: 12 },
  gapRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#12121a', border: '1px solid #2a2a3a', borderRadius: 8, marginBottom: 6 },
  gapInfo: { display: 'flex', flexDirection: 'column', gap: 2 },
  gapChar: { fontSize: 13, fontWeight: 600, color: '#e4e4ef' },
  gapAction: { fontSize: 12, color: '#8888a0' },
  gapActions: { display: 'flex', gap: 6 },
  resolveBtn: { padding: '4px 10px', background: '#22c55e', border: 'none', borderRadius: 4, color: '#fff', fontSize: 11, cursor: 'pointer' },
  ignoreBtn: { padding: '4px 10px', background: '#1a1a25', border: '1px solid #2a2a3a', borderRadius: 4, color: '#8888a0', fontSize: 11, cursor: 'pointer' },
  textarea: { width: '100%', padding: 10, background: '#1a1a25', border: '1px solid #2a2a3a', borderRadius: 8, color: '#e4e4ef', fontSize: 12, fontFamily: 'monospace', resize: 'vertical', marginBottom: 10 },
  primaryBtn: { padding: '8px 16px', background: '#6366f1', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  secondaryBtn: { padding: '8px 16px', background: '#1a1a25', border: '1px solid #2a2a3a', borderRadius: 6, color: '#8888a0', fontSize: 12, cursor: 'pointer' },
  input: { width: '100%', padding: '8px 10px', background: '#1a1a25', border: '1px solid #2a2a3a', borderRadius: 6, color: '#e4e4ef', fontSize: 12, marginBottom: 8, boxSizing: 'border-box' },
  resultSummary: { display: 'flex', gap: 8, marginBottom: 12 },
  reusedBadge: { padding: '3px 8px', background: '#166534', color: '#4ade80', borderRadius: 4, fontSize: 11, fontWeight: 600 },
  generatedBadge: { padding: '3px 8px', background: '#1e3a5f', color: '#60a5fa', borderRadius: 4, fontSize: 11, fontWeight: 600 },
  gapBadge: { padding: '3px 8px', background: '#713f12', color: '#eab308', borderRadius: 4, fontSize: 11, fontWeight: 600 },
  sceneResult: { marginBottom: 10 },
  sceneTitle: { fontSize: 12, fontWeight: 600, color: '#e4e4ef', marginBottom: 4 },
  filterBtn: { padding: '4px 10px', background: '#1a1a25', border: '1px solid #2a2a3a', borderRadius: 4, color: '#8888a0', fontSize: 11, cursor: 'pointer' },
  filterBtnActive: { background: '#6366f1', color: '#fff', border: '1px solid #6366f1' },
  assetGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 },
  assetCard: { background: '#12121a', border: '1px solid #2a2a3a', borderRadius: 8, overflow: 'hidden', cursor: 'pointer' },
  assetThumb: { width: '100%', height: 120, objectFit: 'cover' },
  assetThumbAudio: { width: '100%', height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a25' },
  assetThumbVideo: { width: '100%', height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a25' },
  assetName: { fontSize: 11, color: '#e4e4ef', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '6px 8px 0' },
  overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  previewContainer: { background: '#12121a', border: '1px solid #2a2a3a', borderRadius: 12, padding: 20, maxWidth: 600, width: '90vw' },
  previewImg: { width: '100%', borderRadius: 8, marginBottom: 12 },
  previewVideo: { width: '100%', borderRadius: 8, marginBottom: 12 },
  previewAudio: { padding: 20, textAlign: 'center', marginBottom: 12 },
  previewInfo: { display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 8 },
  previewName: { fontSize: 13, fontWeight: 600, color: '#e4e4ef' },
  progressBar: { width: '100%', height: 6, background: '#1a1a25', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', background: '#6366f1', borderRadius: 3, transition: 'width 0.3s ease' },
  exprChip: { padding: '4px 10px', background: '#1e3a5f', border: '1px solid #2a2a3a', borderRadius: 6, fontSize: 11, color: '#60a5fa', fontWeight: 600 },
  heatmap: { display: 'flex', flexDirection: 'column', gap: 2 },
  heatmapHeader: { display: 'flex', gap: 0, marginBottom: 4 },
  heatmapRow: { display: 'flex', gap: 0 },
  heatmapName: { width: 90, fontSize: 11, color: '#e4e4ef', padding: '4px 8px', fontWeight: 600 },
  heatmapCell: { width: 48, textAlign: 'center', fontSize: 11, color: '#8888a0', padding: '4px 0', background: '#1a1a25', borderRadius: 2 },
  heatmapFilled: { background: '#166534', color: '#4ade80' },
  breakdownRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' },
  breakdownType: { fontSize: 12, color: '#e4e4ef', width: 120 },
  breakdownBar: { flex: 1, height: 6, background: '#1a1a25', borderRadius: 3, overflow: 'hidden' },
  breakdownFill: { height: '100%', background: '#6366f1', borderRadius: 3 },
  breakdownCount: { fontSize: 12, color: '#8888a0', width: 30, textAlign: 'right' },
  healthRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' },
  healthDot: { width: 8, height: 8, borderRadius: '50%' },
  healthName: { fontSize: 12, color: '#e4e4ef', width: 100 },
};
