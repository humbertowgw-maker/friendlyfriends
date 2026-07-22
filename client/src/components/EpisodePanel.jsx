import { useState, useEffect, useRef } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

import {
  fetchEpisodes,
  fetchEpisode,
  createEpisode,
  deleteEpisode,
  addScene,
  updateScene,
  deleteScene,
  reorderScenes,
  approveEpisodeStage,
  rejectEpisodeStage,
  generateEpisodeAssets,
  generateSceneBackground,
  generateSceneAudio,
  assembleSceneVideo,
  fullBuildEpisode,
  fetchEpisodePipelineStatus,
  fetchSceneTemplates,
  addSceneFromTemplate,
  fetchInventoryCharacters,
} from '../lib/api.js';

const BACKGROUNDS = [
  'living_room', 'backyard', 'kitchen', 'bedroom', 'park', 'garden',
  'pet_store', 'veterinary', 'beach', 'forest', 'sky', 'nighttime',
  'indoor_general', 'outdoor_general',
];

const STATUSES = ['draft', 'assets_ready', 'assembled', 'built', 'published'];
const APPROVAL_STAGES = ['script', 'art', 'audio', 'final'];

export function EpisodePanel() {
  const [tab, setTab] = useState('list');
  const [episodes, setEpisodes] = useState([]);
  const [selectedEp, setSelectedEp] = useState(null);
  const [epDetail, setEpDetail] = useState(null);
  const [characters, setCharacters] = useState([]);
  const [pipelineStatus, setPipelineStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [buildLog, setBuildLog] = useState(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newEp, setNewEp] = useState({ title: '', slug: '', description: '' });
  const [showSceneForm, setShowSceneForm] = useState(false);
  const [newScene, setNewScene] = useState({ title: '', narration: '', background_scene: 'living_room', dialogue: '', actions: '' });
  const [editingScene, setEditingScene] = useState(null);
  const [editNarration, setEditNarration] = useState('');
  const [dragIdx, setDragIdx] = useState(null);
  const [generatingScene, setGeneratingScene] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [templates, setTemplates] = useState(null);
  const [templateCategory, setTemplateCategory] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [eps, chars, ps] = await Promise.all([
        fetchEpisodes(),
        fetchInventoryCharacters(),
        fetchEpisodePipelineStatus(),
      ]);
      setEpisodes(eps);
      setCharacters(chars);
      setPipelineStatus(ps);
    } catch {}
    setLoading(false);
  };

  const loadEpisode = async (id) => {
    setSelectedEp(id);
    try {
      const ep = await fetchEpisode(id);
      setEpDetail(ep);
      setTab('detail');
    } catch {}
  };

  const handleCreateEp = async () => {
    if (!newEp.title || !newEp.slug) return;
    await createEpisode(newEp);
    setNewEp({ title: '', slug: '', description: '' });
    setShowNewForm(false);
    loadAll();
  };

  const handleAddScene = async () => {
    if (!epDetail) return;
    const actions = newScene.actions.split('\n').filter(l => l.trim()).map(line => {
      const [slug, ...rest] = line.split(':');
      return { character_slug: slug?.trim().toLowerCase(), action_label: rest.join(':').trim() };
    });
    const dialogue = newScene.dialogue.split('\n').filter(l => l.trim()).map(line => {
      const [slug, ...rest] = line.split(':');
      return { character_slug: slug?.trim().toLowerCase(), text: rest.join(':').trim() };
    });
    await addScene(epDetail.id, {
      title: newScene.title,
      narration: newScene.narration,
      background_scene: newScene.background_scene,
      actions,
      dialogue,
    });
    setNewScene({ title: '', narration: '', background_scene: 'living_room', dialogue: '', actions: '' });
    setShowSceneForm(false);
    loadEpisode(epDetail.id);
  };

  const handleFullBuild = async () => {
    if (!epDetail) return;
    setBuilding(true);
    setBuildLog(null);
    try {
      const result = await fullBuildEpisode(epDetail.id);
      setBuildLog(result.build_log);
      loadEpisode(epDetail.id);
    } catch (e) {
      setBuildLog({ steps: [{ step: 'error', error: e.message }] });
    }
    setBuilding(false);
  };

  const handleApprove = async (stage) => {
    if (!epDetail) return;
    await approveEpisodeStage(epDetail.id, stage, 'user');
    loadEpisode(epDetail.id);
  };

  const handleReject = async (stage) => {
    if (!epDetail) return;
    const notes = prompt('Rejection reason:');
    if (notes !== null) {
      await rejectEpisodeStage(epDetail.id, stage, 'user', notes);
      loadEpisode(epDetail.id);
    }
  };

  const loadTemplates = async () => {
    const data = await fetchSceneTemplates(templateCategory || undefined);
    setTemplates(data);
  };

  const handleAddTemplate = async (templateId) => {
    if (!epDetail) return;
    await addSceneFromTemplate(epDetail.id, templateId);
    loadEpisode(epDetail.id);
    setShowTemplates(false);
  };

  const handleSceneAction = async (sceneId, action) => {
    setGeneratingScene({ sceneId, action });
    try {
      if (action === 'background') await generateSceneBackground(sceneId);
      else if (action === 'audio') await generateSceneAudio(sceneId);
      else if (action === 'video') await assembleSceneVideo(sceneId);
      loadEpisode(epDetail.id);
    } catch (e) { alert(e.message); }
    setGeneratingScene(null);
  };

  const handleSaveNarration = async (sceneId) => {
    await updateScene(sceneId, { narration: editNarration });
    setEditingScene(null);
    loadEpisode(epDetail.id);
  };

  const handleDragStart = (idx) => setDragIdx(idx);
  const handleDragOver = (e) => e.preventDefault();
  const handleDrop = async (targetIdx) => {
    if (dragIdx === null || dragIdx === targetIdx) return;
    const scenes = [...epDetail.scenes];
    const [moved] = scenes.splice(dragIdx, 1);
    scenes.splice(targetIdx, 0, moved);
    const sceneIds = scenes.map(s => s.id);
    setEpDetail({ ...epDetail, scenes });
    setDragIdx(null);
    await reorderScenes(epDetail.id, sceneIds);
    loadEpisode(epDetail.id);
  };

  const statusColor = (s) => ({ draft: '#8888a0', assets_ready: '#eab308', assembled: '#60a5fa', built: '#4ade80', published: '#a78bfa' }[s] || '#8888a0');
  const approvalColor = (s) => ({ pending: '#eab308', approved: '#4ade80', rejected: '#ef4444' }[s] || '#8888a0');
  const actionIcon = (a) => ({ background: 'BG', audio: 'AU', video: 'VD' }[a] || a);

  return (
    <div>
      <div style={styles.tabBar}>
        {['list', 'detail', 'pipeline'].map(t => (
          <button key={t} style={{ ...styles.tabBtn, ...(tab === t ? styles.tabBtnActive : {}) }} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'list' && (
        <div>
          <div style={styles.header}>
            <span style={styles.dim}>{episodes.length} episode{episodes.length !== 1 ? 's' : ''}</span>
            <button style={styles.primaryBtn} onClick={() => setShowNewForm(true)}>+ New Episode</button>
          </div>
          {showNewForm && (
            <div style={styles.card}>
              <h4 style={styles.cardTitle}>New Episode</h4>
              <input style={styles.input} placeholder="Title" value={newEp.title} onChange={e => setNewEp({ ...newEp, title: e.target.value, slug: e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') })} />
              <input style={styles.input} placeholder="Slug" value={newEp.slug} onChange={e => setNewEp({ ...newEp, slug: e.target.value })} />
              <textarea style={styles.textarea} rows={2} placeholder="Description" value={newEp.description} onChange={e => setNewEp({ ...newEp, description: e.target.value })} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={styles.primaryBtn} onClick={handleCreateEp}>Create</button>
                <button style={styles.secondaryBtn} onClick={() => setShowNewForm(false)}>Cancel</button>
              </div>
            </div>
          )}
          {episodes.map(ep => (
            <div key={ep.id} style={styles.epRow} onClick={() => loadEpisode(ep.id)}>
              <div style={styles.epInfo}>
                <span style={styles.epTitle}>{ep.title}</span>
                <span style={styles.dim}>{ep.slug} &middot; {ep.scene_count || ep.scenes?.length || 0} scenes</span>
              </div>
              <div style={styles.epMeta}>
                <span style={{ ...styles.statusBadge, color: statusColor(ep.status) }}>{ep.status}</span>
                <span style={{ ...styles.statusBadge, color: approvalColor(ep.approval_status) }}>{ep.approval_status}</span>
              </div>
            </div>
          ))}
          {episodes.length === 0 && <p style={styles.dim}>No episodes yet. Create one to get started.</p>}
        </div>
      )}

      {tab === 'detail' && epDetail && (
        <div>
          <div style={styles.header}>
            <div>
              <h3 style={styles.epDetailTitle}>{epDetail.title}</h3>
              <span style={styles.dim}>{epDetail.slug} &middot; {epDetail.scenes?.length || 0} scenes &middot; </span>
              <span style={{ color: statusColor(epDetail.status), fontSize: 12, fontWeight: 600 }}>{epDetail.status}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={styles.primaryBtn} onClick={handleFullBuild} disabled={building}>
                {building ? 'Building...' : 'Full Build'}
              </button>
              {epDetail.status === 'assembled' && (
                <a href={`${API_BASE}/episodes/${epDetail.id}/export`} style={styles.exportBtn} download>Download MP4</a>
              )}
              <button style={styles.secondaryBtn} onClick={() => { setTab('list'); setSelectedEp(null); setEpDetail(null); }}>Back</button>
            </div>
          </div>

          {buildLog && (
            <div style={styles.card}>
              <h4 style={styles.cardTitle}>Build Log</h4>
              {buildLog.steps.map((s, i) => (
                <div key={i} style={styles.logRow}>
                  <span style={styles.logStep}>{s.step}</span>
                  <span style={styles.logScene}>{s.scene || ''}</span>
                  <span style={{ color: s.error ? '#ef4444' : '#4ade80', fontSize: 11 }}>{s.error || s.asset_ref || 'ok'}</span>
                </div>
              ))}
            </div>
          )}

          <div style={styles.card}>
            <h4 style={styles.cardTitle}>Approval</h4>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {APPROVAL_STAGES.map(stage => {
                const approval = epDetail.approvals?.find(a => a.stage === stage);
                return (
                  <div key={stage} style={styles.approvalBox}>
                    <span style={styles.approvalStage}>{stage}</span>
                    <span style={{ color: approvalColor(approval?.status || 'pending'), fontSize: 11 }}>{approval?.status || 'pending'}</span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button style={styles.approveBtn} onClick={() => handleApprove(stage)}>Approve</button>
                      <button style={styles.rejectBtn} onClick={() => handleReject(stage)}>Reject</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {epDetail.scenes?.length > 0 && (
            <div style={styles.timeline}>
              {epDetail.scenes.map((scene, idx) => (
                <div
                  key={scene.id}
                  style={{
                    ...styles.timelineNode,
                    borderColor: scene.video_asset_ref ? '#4ade80' : scene.audio_asset_ref ? '#60a5fa' : scene.image_asset_ref ? '#eab308' : '#2a2a3a',
                  }}
                  title={scene.title || `Scene ${idx + 1}`}
                >
                  <span style={styles.timelineNum}>{idx + 1}</span>
                  {scene.image_asset_ref && (
                    <img src={`/assets/${scene.image_asset_ref}`} alt="" style={styles.timelineThumb} />
                  )}
                </div>
              ))}
            </div>
          )}

          <div style={styles.header}>
            <h4 style={styles.cardTitle}>Scenes</h4>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={styles.secondaryBtn} onClick={() => { setShowTemplates(!showTemplates); if (!templates) loadTemplates(); }}>From Template</button>
              <button style={styles.primaryBtn} onClick={() => setShowSceneForm(true)}>+ Add Scene</button>
            </div>
          </div>
          {showTemplates && (
            <div style={styles.card}>
              <h4 style={styles.cardTitle}>Scene Templates</h4>
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                <button style={{ ...styles.filterBtn, ...(!templateCategory ? styles.filterBtnActive : {}) }} onClick={() => { setTemplateCategory(''); loadTemplates(); }}>All</button>
                {templates?.categories && Object.entries(templates.categories).map(([key, cat]) => (
                  <button key={key} style={{ ...styles.filterBtn, ...(templateCategory === key ? styles.filterBtnActive : {}) }} onClick={() => { setTemplateCategory(key); loadTemplates(); }}>{cat.name}</button>
                ))}
              </div>
              {templates?.templates?.map(t => (
                <div key={t.id} style={styles.templateRow}>
                  <div style={styles.templateInfo}>
                    <span style={styles.templateName}>{t.name}</span>
                    <span style={styles.dim}>{t.category} &middot; {t.background_scene?.replace(/_/g, ' ')}</span>
                    <span style={{ ...styles.dim, fontSize: 11 }}>{t.narration?.slice(0, 80)}...</span>
                  </div>
                  <button style={styles.primaryBtn} onClick={() => handleAddTemplate(t.id)}>Use</button>
                </div>
              ))}
              <button style={styles.secondaryBtn} onClick={() => setShowTemplates(false)} >Close</button>
            </div>
          )}
          {showSceneForm && (
            <div style={styles.card}>
              <h4 style={styles.cardTitle}>New Scene</h4>
              <input style={styles.input} placeholder="Scene title" value={newScene.title} onChange={e => setNewScene({ ...newScene, title: e.target.value })} />
              <textarea style={styles.textarea} rows={2} placeholder="Narration text" value={newScene.narration} onChange={e => setNewScene({ ...newScene, narration: e.target.value })} />
              <div style={styles.bgPicker}>
                {BACKGROUNDS.map(b => (
                  <button
                    key={b}
                    style={{ ...styles.bgChip, ...(newScene.background_scene === b ? styles.bgChipActive : {}) }}
                    onClick={() => setNewScene({ ...newScene, background_scene: b })}
                  >
                    {b.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
              <textarea style={styles.textarea} rows={2} placeholder="Actions (slug: action per line)&#10;achilles: sitting&#10;henry: walking" value={newScene.actions} onChange={e => setNewScene({ ...newScene, actions: e.target.value })} />
              <textarea style={styles.textarea} rows={2} placeholder="Dialogue (slug: text per line)&#10;henry: Meow!&#10;peter: Tweet tweet!" value={newScene.dialogue} onChange={e => setNewScene({ ...newScene, dialogue: e.target.value })} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={styles.primaryBtn} onClick={handleAddScene}>Add Scene</button>
                <button style={styles.secondaryBtn} onClick={() => setShowSceneForm(false)}>Cancel</button>
              </div>
            </div>
          )}
          {epDetail.scenes?.map((scene, idx) => (
            <div
              key={scene.id}
              style={styles.sceneCard}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(idx)}
            >
              <div style={styles.sceneHeader}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={styles.dragHandle}>:::</span>
                  <span style={styles.sceneTitle}>{scene.title || `Scene ${idx + 1}`}</span>
                  <span style={{ ...styles.statusBadge, color: statusColor(scene.status) }}>{scene.status}</span>
                </div>
                <button style={styles.dangerBtn} onClick={async () => { await deleteScene(scene.id); loadEpisode(epDetail.id); }}>Delete</button>
              </div>

              {scene.image_asset_ref && (
                <div style={styles.scenePreview}>
                  <img src={`/assets/${scene.image_asset_ref}`} alt="" style={styles.sceneThumb} />
                  {scene.audio_asset_ref && <span style={styles.assetBadge}>Audio</span>}
                  {scene.video_asset_ref && <span style={{ ...styles.assetBadge, background: '#166534', color: '#4ade80' }}>Video</span>}
                </div>
              )}

              {editingScene === scene.id ? (
                <div style={{ marginBottom: 8 }}>
                  <textarea
                    style={styles.textarea}
                    rows={3}
                    value={editNarration}
                    onChange={e => setEditNarration(e.target.value)}
                    autoFocus
                  />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button style={styles.primaryBtn} onClick={() => handleSaveNarration(scene.id)}>Save</button>
                    <button style={styles.secondaryBtn} onClick={() => setEditingScene(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                scene.narration && (
                  <p
                    style={styles.sceneText}
                    onClick={() => { setEditingScene(scene.id); setEditNarration(scene.narration); }}
                    title="Click to edit"
                  >
                    {scene.narration}
                  </p>
                )
              )}

              <div style={styles.sceneMeta}>
                <span style={styles.dim}>Background: {scene.background_scene?.replace(/_/g, ' ')}</span>
              </div>

              {scene.actions?.length > 0 && (
                <div style={styles.sceneActions}>
                  {scene.actions.map((a, i) => (
                    <span key={i} style={styles.actionBadge}>{a.character_slug}: {a.action_label}</span>
                  ))}
                </div>
              )}

              <div style={styles.sceneBtnRow}>
                <button
                  style={{ ...styles.genBtn, opacity: generatingScene?.sceneId === scene.id && generatingScene?.action === 'background' ? 0.5 : 1 }}
                  onClick={() => handleSceneAction(scene.id, 'background')}
                  disabled={!!generatingScene}
                >
                  {generatingScene?.sceneId === scene.id && generatingScene?.action === 'background' ? '...' : 'BG'}
                </button>
                <button
                  style={{ ...styles.genBtn, opacity: generatingScene?.sceneId === scene.id && generatingScene?.action === 'audio' ? 0.5 : 1 }}
                  onClick={() => handleSceneAction(scene.id, 'audio')}
                  disabled={!!generatingScene}
                >
                  {generatingScene?.sceneId === scene.id && generatingScene?.action === 'audio' ? '...' : 'AU'}
                </button>
                <button
                  style={{ ...styles.genBtn, opacity: generatingScene?.sceneId === scene.id && generatingScene?.action === 'video' ? 0.5 : 1 }}
                  onClick={() => handleSceneAction(scene.id, 'video')}
                  disabled={!!generatingScene}
                >
                  {generatingScene?.sceneId === scene.id && generatingScene?.action === 'video' ? '...' : 'VD'}
                </button>
              </div>
            </div>
          ))}
          {(!epDetail.scenes || epDetail.scenes.length === 0) && <p style={styles.dim}>No scenes yet. Add one to start building.</p>}
        </div>
      )}

      {tab === 'pipeline' && (
        <div>
          <div style={styles.card}>
            <h4 style={styles.cardTitle}>Pipeline Status</h4>
            {pipelineStatus && (
              <div>
                <p style={styles.dim}>Generators: {pipelineStatus.generators?.available ? 'Available' : 'Not configured'}</p>
                <p style={styles.dim}>TTS: {pipelineStatus.tts?.tts_available ? `${pipelineStatus.tts.tts_name} (${pipelineStatus.tts.voices?.length} voices)` : 'Not installed'}</p>
                <p style={styles.dim}>Video Assembler: {pipelineStatus.assembler?.available ? 'FFmpeg available' : 'FFmpeg not installed'}</p>
              </div>
            )}
          </div>
          <div style={styles.card}>
            <h4 style={styles.cardTitle}>Available Backgrounds</h4>
            <div style={styles.bgPicker}>
              {BACKGROUNDS.map(b => (
                <span key={b} style={styles.bgChip}>{b.replace(/_/g, ' ')}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {previewImage && (
        <div style={styles.overlay} onClick={() => setPreviewImage(null)}>
          <img src={previewImage} style={styles.previewImg} />
        </div>
      )}
    </div>
  );
}

const styles = {
  tabBar: { display: 'flex', gap: 4, marginBottom: 16 },
  tabBtn: { padding: '6px 14px', borderRadius: 6, border: '1px solid #2a2a3a', background: 'transparent', color: '#8888a0', cursor: 'pointer', fontSize: 12, fontWeight: 500 },
  tabBtnActive: { background: '#6366f1', color: '#fff', border: '1px solid #6366f1' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  card: { background: '#12121a', border: '1px solid #2a2a3a', borderRadius: 12, padding: 20, marginBottom: 12 },
  cardTitle: { fontSize: 13, fontWeight: 600, marginBottom: 10, color: '#e4e4ef' },
  dim: { color: '#8888a0', fontSize: 12 },
  input: { width: '100%', padding: '8px 10px', background: '#1a1a25', border: '1px solid #2a2a3a', borderRadius: 6, color: '#e4e4ef', fontSize: 12, marginBottom: 8, boxSizing: 'border-box' },
  textarea: { width: '100%', padding: 8, background: '#1a1a25', border: '1px solid #2a2a3a', borderRadius: 6, color: '#e4e4ef', fontSize: 12, fontFamily: 'monospace', resize: 'vertical', marginBottom: 8, boxSizing: 'border-box' },
  select: { padding: '6px 10px', background: '#1a1a25', border: '1px solid #2a2a3a', borderRadius: 6, color: '#e4e4ef', fontSize: 12, marginBottom: 8 },
  primaryBtn: { padding: '6px 14px', background: '#6366f1', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  secondaryBtn: { padding: '6px 14px', background: '#1a1a25', border: '1px solid #2a2a3a', borderRadius: 6, color: '#8888a0', fontSize: 12, cursor: 'pointer' },
  exportBtn: { padding: '6px 14px', background: '#166534', border: 'none', borderRadius: 6, color: '#4ade80', fontSize: 12, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', display: 'inline-block' },
  smallBtn: { padding: '4px 10px', background: '#1a1a25', border: '1px solid #2a2a3a', borderRadius: 4, color: '#e4e4ef', fontSize: 11, cursor: 'pointer' },
  genBtn: { padding: '4px 10px', background: '#1a1a25', border: '1px solid #2a2a3a', borderRadius: 4, color: '#e4e4ef', fontSize: 11, fontWeight: 600, cursor: 'pointer', minWidth: 32 },
  dangerBtn: { padding: '4px 10px', background: '#1a1a25', border: '1px solid #7f1d1d', borderRadius: 4, color: '#ef4444', fontSize: 11, cursor: 'pointer' },
  epRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#12121a', border: '1px solid #2a2a3a', borderRadius: 10, marginBottom: 6, cursor: 'pointer' },
  epInfo: { display: 'flex', flexDirection: 'column', gap: 2 },
  epTitle: { fontSize: 14, fontWeight: 600, color: '#e4e4ef' },
  epMeta: { display: 'flex', gap: 6 },
  statusBadge: { fontSize: 10, fontWeight: 600, padding: '2px 8px', background: '#1a1a25', borderRadius: 4, textTransform: 'uppercase' },
  epDetailTitle: { fontSize: 18, fontWeight: 700, color: '#e4e4ef', marginBottom: 2 },
  approvalBox: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 12px', background: '#1a1a25', borderRadius: 8, minWidth: 80 },
  approvalStage: { fontSize: 11, fontWeight: 600, color: '#e4e4ef', textTransform: 'capitalize' },
  approveBtn: { padding: '2px 8px', background: '#166534', border: 'none', borderRadius: 3, color: '#4ade80', fontSize: 10, cursor: 'pointer' },
  rejectBtn: { padding: '2px 8px', background: '#7f1d1d', border: 'none', borderRadius: 3, color: '#ef4444', fontSize: 10, cursor: 'pointer' },
  timeline: { display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto', padding: '8px 0' },
  timelineNode: { minWidth: 48, height: 48, borderRadius: 8, border: '2px solid #2a2a3a', background: '#1a1a25', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden', flexShrink: 0 },
  timelineNum: { fontSize: 11, fontWeight: 700, color: '#8888a0', position: 'absolute', top: 2, left: 4 },
  timelineThumb: { width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6 },
  sceneCard: { background: '#12121a', border: '1px solid #2a2a3a', borderRadius: 10, padding: 16, marginBottom: 8, cursor: 'grab' },
  sceneHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  dragHandle: { color: '#4a4a5a', fontSize: 14, cursor: 'grab', userSelect: 'none' },
  sceneTitle: { fontSize: 14, fontWeight: 600, color: '#e4e4ef' },
  sceneText: { fontSize: 12, color: '#8888a0', marginBottom: 6, fontStyle: 'italic', cursor: 'pointer', padding: '4px 0' },
  scenePreview: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  sceneThumb: { maxWidth: 120, maxHeight: 80, borderRadius: 6, border: '1px solid #2a2a3a' },
  sceneMeta: { display: 'flex', gap: 8, marginBottom: 6, fontSize: 11, color: '#8888a0' },
  assetBadge: { padding: '1px 6px', background: '#1e3a5f', color: '#60a5fa', borderRadius: 3, fontSize: 10, fontWeight: 600 },
  sceneActions: { display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 },
  actionBadge: { padding: '2px 6px', background: '#1a1a25', borderRadius: 3, fontSize: 10, color: '#e4e4ef' },
  sceneBtnRow: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  bgPicker: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 },
  bgChip: { padding: '4px 10px', background: '#1a1a25', border: '1px solid #2a2a3a', borderRadius: 6, fontSize: 11, color: '#8888a0', cursor: 'pointer' },
  bgChipActive: { background: '#6366f1', color: '#fff', border: '1px solid #6366f1' },
  filterBtn: { padding: '4px 10px', background: '#1a1a25', border: '1px solid #2a2a3a', borderRadius: 4, color: '#8888a0', fontSize: 11, cursor: 'pointer' },
  filterBtnActive: { background: '#6366f1', color: '#fff', border: '1px solid #6366f1' },
  templateRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #1a1a25' },
  templateInfo: { display: 'flex', flexDirection: 'column', gap: 2, flex: 1 },
  templateName: { fontSize: 13, fontWeight: 600, color: '#e4e4ef' },
  logRow: { display: 'flex', gap: 8, padding: '4px 0', borderBottom: '1px solid #1a1a25', fontSize: 12 },
  logStep: { fontWeight: 600, color: '#6366f1', minWidth: 80 },
  logScene: { color: '#8888a0', flex: 1 },
  overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, cursor: 'pointer' },
  previewImg: { maxWidth: '90vw', maxHeight: '90vh', borderRadius: 12 },
};
