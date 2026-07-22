import { useState, useEffect } from 'react';
import {
  fetchEpisodes,
  fetchEpisode,
  createEpisode,
  deleteEpisode,
  addScene,
  updateScene,
  deleteScene,
  approveEpisodeStage,
  rejectEpisodeStage,
  generateEpisodeAssets,
  generateSceneBackground,
  generateSceneAudio,
  assembleSceneVideo,
  fullBuildEpisode,
  fetchEpisodePipelineStatus,
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

  const handleSceneAction = async (sceneId, action) => {
    try {
      if (action === 'background') await generateSceneBackground(sceneId);
      else if (action === 'audio') await generateSceneAudio(sceneId);
      else if (action === 'video') await assembleSceneVideo(sceneId);
      loadEpisode(epDetail.id);
    } catch (e) { alert(e.message); }
  };

  const statusColor = (s) => ({ draft: '#8888a0', assets_ready: '#eab308', assembled: '#60a5fa', built: '#4ade80', published: '#a78bfa' }[s] || '#8888a0');
  const approvalColor = (s) => ({ pending: '#eab308', approved: '#4ade80', rejected: '#ef4444' }[s] || '#8888a0');

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
                <span style={styles.dim}>{ep.slug}</span>
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
              <span style={{ color: statusColor(epDetail.status) }}>{epDetail.status}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={styles.primaryBtn} onClick={handleFullBuild} disabled={building}>
                {building ? 'Building...' : 'Full Build'}
              </button>
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

          <div style={styles.header}>
            <h4 style={styles.cardTitle}>Scenes</h4>
            <button style={styles.primaryBtn} onClick={() => setShowSceneForm(true)}>+ Add Scene</button>
          </div>
          {showSceneForm && (
            <div style={styles.card}>
              <h4 style={styles.cardTitle}>New Scene</h4>
              <input style={styles.input} placeholder="Scene title" value={newScene.title} onChange={e => setNewScene({ ...newScene, title: e.target.value })} />
              <textarea style={styles.textarea} rows={2} placeholder="Narration text" value={newScene.narration} onChange={e => setNewScene({ ...newScene, narration: e.target.value })} />
              <select style={styles.select} value={newScene.background_scene} onChange={e => setNewScene({ ...newScene, background_scene: e.target.value })}>
                {BACKGROUNDS.map(b => <option key={b} value={b}>{b.replace(/_/g, ' ')}</option>)}
              </select>
              <textarea style={styles.textarea} rows={2} placeholder="Actions (slug: action per line)&#10;achilles: sitting&#10;henry: walking" value={newScene.actions} onChange={e => setNewScene({ ...newScene, actions: e.target.value })} />
              <textarea style={styles.textarea} rows={2} placeholder="Dialogue (slug: text per line)&#10;henry: Meow!&#10;peter: Tweet tweet!" value={newScene.dialogue} onChange={e => setNewScene({ ...newScene, dialogue: e.target.value })} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={styles.primaryBtn} onClick={handleAddScene}>Add Scene</button>
                <button style={styles.secondaryBtn} onClick={() => setShowSceneForm(false)}>Cancel</button>
              </div>
            </div>
          )}
          {epDetail.scenes?.map(scene => (
            <div key={scene.id} style={styles.sceneCard}>
              <div style={styles.sceneHeader}>
                <span style={styles.sceneTitle}>{scene.title || `Scene ${scene.scene_order + 1}`}</span>
                <span style={{ ...styles.statusBadge, color: statusColor(scene.status) }}>{scene.status}</span>
              </div>
              {scene.narration && <p style={styles.sceneText}>{scene.narration}</p>}
              <div style={styles.sceneMeta}>
                <span style={styles.dim}>Background: {scene.background_scene?.replace(/_/g, ' ')}</span>
                {scene.image_asset_ref && <span style={styles.assetBadge}>Image</span>}
                {scene.audio_asset_ref && <span style={styles.assetBadge}>Audio</span>}
                {scene.video_asset_ref && <span style={styles.assetBadge}>Video</span>}
              </div>
              {scene.actions?.length > 0 && (
                <div style={styles.sceneActions}>
                  {scene.actions.map((a, i) => (
                    <span key={i} style={styles.actionBadge}>{a.character_slug}: {a.action_label}</span>
                  ))}
                </div>
              )}
              <div style={styles.sceneBtnRow}>
                <button style={styles.smallBtn} onClick={() => handleSceneAction(scene.id, 'background')}>Gen Background</button>
                <button style={styles.smallBtn} onClick={() => handleSceneAction(scene.id, 'audio')}>Gen Audio</button>
                <button style={styles.smallBtn} onClick={() => handleSceneAction(scene.id, 'video')}>Assemble Video</button>
                <button style={styles.dangerBtn} onClick={async () => { await deleteScene(scene.id); loadEpisode(epDetail.id); }}>Delete</button>
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
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {BACKGROUNDS.map(b => (
                <span key={b} style={styles.bgBadge}>{b.replace(/_/g, ' ')}</span>
              ))}
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
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  card: { background: '#12121a', border: '1px solid #2a2a3a', borderRadius: 12, padding: 20, marginBottom: 12 },
  cardTitle: { fontSize: 13, fontWeight: 600, marginBottom: 10, color: '#e4e4ef' },
  dim: { color: '#8888a0', fontSize: 12 },
  input: { width: '100%', padding: '8px 10px', background: '#1a1a25', border: '1px solid #2a2a3a', borderRadius: 6, color: '#e4e4ef', fontSize: 12, marginBottom: 8, boxSizing: 'border-box' },
  textarea: { width: '100%', padding: 8, background: '#1a1a25', border: '1px solid #2a2a3a', borderRadius: 6, color: '#e4e4ef', fontSize: 12, fontFamily: 'monospace', resize: 'vertical', marginBottom: 8, boxSizing: 'border-box' },
  select: { padding: '6px 10px', background: '#1a1a25', border: '1px solid #2a2a3a', borderRadius: 6, color: '#e4e4ef', fontSize: 12, marginBottom: 8 },
  primaryBtn: { padding: '6px 14px', background: '#6366f1', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  secondaryBtn: { padding: '6px 14px', background: '#1a1a25', border: '1px solid #2a2a3a', borderRadius: 6, color: '#8888a0', fontSize: 12, cursor: 'pointer' },
  smallBtn: { padding: '4px 10px', background: '#1a1a25', border: '1px solid #2a2a3a', borderRadius: 4, color: '#e4e4ef', fontSize: 11, cursor: 'pointer' },
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
  sceneCard: { background: '#12121a', border: '1px solid #2a2a3a', borderRadius: 10, padding: 16, marginBottom: 8 },
  sceneHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  sceneTitle: { fontSize: 14, fontWeight: 600, color: '#e4e4ef' },
  sceneText: { fontSize: 12, color: '#8888a0', marginBottom: 6, fontStyle: 'italic' },
  sceneMeta: { display: 'flex', gap: 8, marginBottom: 6, fontSize: 11, color: '#8888a0' },
  assetBadge: { padding: '1px 6px', background: '#1e3a5f', color: '#60a5fa', borderRadius: 3, fontSize: 10, fontWeight: 600 },
  sceneActions: { display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 },
  actionBadge: { padding: '2px 6px', background: '#1a1a25', borderRadius: 3, fontSize: 10, color: '#e4e4ef' },
  sceneBtnRow: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  logRow: { display: 'flex', gap: 8, padding: '4px 0', borderBottom: '1px solid #1a1a25', fontSize: 12 },
  logStep: { fontWeight: 600, color: '#6366f1', minWidth: 80 },
  logScene: { color: '#8888a0', flex: 1 },
  bgBadge: { padding: '3px 8px', background: '#1a1a25', border: '1px solid #2a2a3a', borderRadius: 4, fontSize: 11, color: '#e4e4ef' },
};
