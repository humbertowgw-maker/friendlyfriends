import { useState, useEffect, useRef, useCallback } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

const YJS_URL = 'ws://localhost:1234';

function CollabEditor({docId, initialContent, userName, onSave, onCancel}){
  const textareaRef=useRef(null);
  const mirrorRef=useRef(null);
  const providerRef=useRef(null);
  const ydocRef=useRef(null);
  const awarenessRef=useRef(null);
  const connected=useRef(false);
  const remoteUsers=useRef(new Map());
  const [remoteCursors,setRemoteCursors]=useState([]);
  const [versions,setVersions]=useState([]);
  const [showVersions,setShowVersions]=useState(false);
  const [savingVersion,setSavingVersion]=useState(false);
  const userColorRef=useRef(`hsl(${Math.random()*360},70%,50%)`);
  const userNameRef=useRef(userName||'Anonymous');
  useEffect(()=>{userNameRef.current=userName||'Anonymous'},[userName]);

  useEffect(()=>{
    const ydoc=new Y.Doc();
    ydocRef.current=ydoc;
    const ytext=ydoc.getText('content');
    ytext.insert(0,initialContent||'');

    const provider=new WebsocketProvider(YJS_URL,`brain-${docId}`,ydoc);
    providerRef.current=provider;

    // Awareness for remote cursors
    const awareness=provider.awareness;
    awarenessRef.current=awareness;
    awareness.setLocalStateField('user',{
      name:userNameRef.current,
      color:userColorRef.current,
      cursor:null,
      selection:null
    });

    awareness.on('change',()=>{
      const states=awareness.getStates();
      const cursors=[];
      states.forEach((state,clientID)=>{
        if(clientID!==awareness.clientID && state.user){
          cursors.push({clientID,...state.user});
        }
      });
      setRemoteCursors(cursors);
    });

    provider.on('status',event=>{connected.current=event.status==='connected'});

    const textarea=textareaRef.current;
    if(textarea){
      textarea.value=ytext.toString();
      const observer=()=>{if(textarea.value!==ytext.toString())textarea.value=ytext.toString()};
      ytext.observe(observer);
      
      // Track cursor/selection position
      const updateAwareness=()=>{
        const start=textarea.selectionStart;
        const end=textarea.selectionEnd;
        awareness.setLocalStateField('user',{
          name:userNameRef.current,
          color:userColorRef.current,
          cursor:start,
          selection:start!==end?{start,end}:null
        });
      };
      textarea.addEventListener('input',()=>{
        ydoc.transact(()=>{ytext.delete(0,ytext.length);ytext.insert(0,textarea.value)});
        updateAwareness();
      });
      textarea.addEventListener('keyup',updateAwareness);
      textarea.addEventListener('click',updateAwareness);
      textarea.addEventListener('select',updateAwareness);
      
      return ()=>{
        ytext.unobserve(observer);
        textarea.removeEventListener('input',updateAwareness);
        textarea.removeEventListener('keyup',updateAwareness);
        textarea.removeEventListener('click',updateAwareness);
        textarea.removeEventListener('select',updateAwareness);
        provider.destroy();ydoc.destroy()
      };
    }
  },[docId,initialContent,userName]);

  // Save version snapshot
  const saveVersion=useCallback(async()=>{
    if(!ydocRef.current) return;
    setSavingVersion(true);
    try{
      const ydoc=ydocRef.current;
      const ytext=ydoc.getText('content');
      const content=ytext.toString();
      const update=Y.encodeStateAsUpdate(ydoc);
      // Convert Uint8Array to base64 for storage
      const updateB64=btoa(String.fromCharCode(...update));
      const preview=content.slice(0,100);
      const r=await fetch(`${API}/pet/brain/${docId}/versions`,{
        method:'POST',
        headers:{'Content-Type':'application/json','x-user-id':userId},
        body:JSON.stringify({yjs_update:updateB64,content_preview:preview})
      });
      const d=await r.json();
      if(d.ok){
        // Refresh versions list
        const v=await fetch(`${API}/pet/brain/${docId}/versions`,{headers:{'x-user-id':userId}}).then(r=>r.json());
        setVersions(v);
      }
    }catch(e){console.error('Save version failed:',e)}
    finally{setSavingVersion(false)}
  },[docId]);

  // Load version history
  const loadVersions=useCallback(async()=>{
    try{
      const v=await fetch(`${API}/pet/brain/${docId}/versions`,{headers:{'x-user-id':userId}}).then(r=>r.json());
      setVersions(v);
    }catch(e){}
  },[docId]);

  useEffect(()=>{loadVersions()},[loadVersions]);

  // Periodic auto-save version (every 60 seconds)
  useEffect(()=>{
    const interval=setInterval(saveVersion,60000);
    return ()=>clearInterval(interval);
  },[saveVersion]);

  // Save version on manual save
  const handleSave=async()=>{
    const content=ydocRef.current?.getText('content').toString()||'';
    await saveVersion();
    onSave(content);
  };

  // Restore a version
  const restoreVersion=async(versionId)=>{
    try{
      const r=await fetch(`${API}/pet/brain/${docId}/versions/${versionId}/restore`,{
        method:'POST',headers:{'Content-Type':'application/json','x-user-id':userId}
      });
      const d=await r.json();
      if(d.ok && d.yjs_update){
        const ydoc=ydocRef.current;
        if(ydoc){
          // Decode base64 back to Uint8Array
          const update=new Uint8Array(atob(d.yjs_update).split('').map(c=>c.charCodeAt(0)));
          Y.applyUpdate(ydoc,update);
          // Refresh content
          const textarea=textareaRef.current;
          if(textarea){
            const ytext=ydoc.getText('content');
            textarea.value=ytext.toString();
          }
          await saveVersion();
        }
      }
    }catch(e){console.error('Restore failed:',e)}
  };

  // Render remote cursors overlay
  const renderRemoteCursors=()=>{
    if(!textareaRef.current) return null;
    const textarea=textareaRef.current;
    const rect=textarea.getBoundingClientRect();
    const lineHeight=18; // approximate
    const paddingLeft=8;
    const paddingTop=6;
    const charWidth=8.4; // monospace approx
    
    return remoteCursors.map(u=>{
      if(u.cursor===null) return null;
      const pos=u.cursor;
      // Approximate x,y from cursor position
      const lines=textarea.value.substring(0,pos).split('\n');
      const line=lines.length-1;
      const col=lines[lines.length-1].length;
      const x=rect.left+paddingLeft+col*charWidth;
      const y=rect.top+paddingTop+line*lineHeight;
      
      return (
        <div key={u.clientID} style={{
          position:'fixed',left:x,top:y,pointerEvents:'none',zIndex:1000,
          display:'flex',flexDirection:'column',alignItems:'center'
        }}>
          <div style={{
            width:2,height:lineHeight,background:u.color,
            animation:'blink 1s infinite'
          }}/>
          <span style={{
            background:u.color,color:'#fff',fontSize:9,padding:'1px 4px',
            borderRadius:3,whiteSpace:'nowrap',marginTop:1,transform:'translateX(-50%)',left:'50%',position:'relative'
          }}>{u.name}</span>
        </div>
      );
    });
  };

  return (
    <div style={{display:'flex',flexDirection:'column',gap:4,position:'relative'}}>
      <div style={{position:'relative'}}>
        <textarea ref={textareaRef} style={{width:'100%',minHeight:80,padding:'6px 8px',borderRadius:4,border:'1px solid var(--accent)',background:'#12121a',color:'var(--text)',fontSize:10,outline:'none',resize:'vertical',fontFamily:'monospace'}} spellCheck={false}/>
        {renderRemoteCursors()}
      </div>
      <div style={{display:'flex',gap:4,justifyContent:'space-between',alignItems:'center'}}>
        <div style={{display:'flex',gap:4,alignItems:'center'}}>
          <span style={{fontSize:10,color:connected.current?'#22c55e':'#f97316',alignSelf:'center'}}>{connected.current?'🟢 Synced':'🟡 Connecting...'}</span>
          <button onClick={()=>{setShowVersions(!showVersions);if(!showVersions)loadVersions()}} style={{padding:'4px 8px',borderRadius:4,border:'none',background:showVersions?'var(--accent)':'#2a2a3a',color:showVersions?'#fff':'var(--text)',fontSize:10,cursor:'pointer'}}>{showVersions?'📜 Hide History':'📜 History'}</button>
          <button onClick={saveVersion} disabled={savingVersion} style={{padding:'4px 8px',borderRadius:4,border:'none',background:'#2a2a3a',color:'var(--text)',fontSize:10,cursor:'pointer'}}>{savingVersion?'⏳':'💾 Snapshot'}</button>
        </div>
        <div style={{display:'flex',gap:4}}>
          <button onClick={handleSave} style={{padding:'4px 8px',borderRadius:4,border:'none',background:'var(--accent)',color:'#fff',fontSize:10,cursor:'pointer'}}>Save</button>
          <button onClick={onCancel} style={{padding:'4px 8px',borderRadius:4,border:'none',background:'#2a2a3a',color:'var(--text)',fontSize:10,cursor:'pointer'}}>Cancel</button>
        </div>
      </div>
      {showVersions&&(
        <div style={{marginTop:8,maxHeight:200,overflowY:'auto',borderTop:'1px solid var(--border)',paddingTop:8}}>
          <div style={{fontSize:10,color:'var(--text-dim)',marginBottom:4}}>Version History (newest first)</div>
          {versions.length===0?(
            <div style={{fontSize:10,color:'var(--text-dim)',textAlign:'center',padding:'8px'}}>No versions yet. Click "💾 Snapshot" to save one.</div>
          ):(
            versions.map(v=>(
              <div key={v.id} style={{display:'flex',gap:8,alignItems:'center',padding:'4px 8px',background:'#12121a',borderRadius:4,marginBottom:4}}>
                <div style={{flex:1,fontSize:9,color:'var(--text-dim)'}}>
                  <div>{new Date(v.created_at).toLocaleString()}</div>
                  <div style={{color:'var(--text-dim)',fontSize:8}}>{v.content_preview||'(empty)'}</div>
                </div>
                <button onClick={()=>restoreVersion(v.id)} disabled={savingVersion} style={{padding:'2px 6px',borderRadius:3,border:'none',background:'#166534',color:'#4ade80',fontSize:9,cursor:'pointer'}}>Restore</button>
              </div>
            ))
          )}
        </div>
      )}
      <style>{`@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}`}</style>
    </div>
  );
}

const PETS = [
  { id: 'achilles', name: 'Achilles', emoji: '🐕‍🦺', glow: '#d4a036', bg: 'linear-gradient(135deg,#d4a036,#b8860b)', personality: 'Loyal and steady — your service dog brain.', desc: 'Service Dog' },
  { id: 'athena',   name: 'Athena',   emoji: '🐕',    glow: '#e8c49a', bg: 'linear-gradient(135deg,#e8c49a,#d4a574)', personality: 'Warm and perceptive — I notice everything.', desc: 'Companion Dog' },
  { id: 'henry',    name: 'Henry',    emoji: '😺',    glow: '#c0c0dd', bg: 'linear-gradient(135deg,#e8e8f0,#ccccdd)', personality: 'Quiet and observant — I see what others miss.', desc: 'White Cat' },
  { id: 'falcor',   name: 'Falcor',   emoji: '😻',    glow: '#7ec8e0', bg: 'linear-gradient(135deg,#a8d8ea,#7ec8e0)', personality: 'Wise and dreamy — I think in stories.', desc: 'Eldest Cat' },
  { id: 'peter',    name: 'Peter',    emoji: '🐦',    glow: '#4ade80', bg: 'linear-gradient(135deg,#4ade80,#22c55e)', personality: 'Cheerful and chatty — let me sing you some data.', desc: 'Parakeet' },
  { id: 'walter',   name: 'Walter',   emoji: '🐤',    glow: '#60a5fa', bg: 'linear-gradient(135deg,#60a5fa,#3b82f6)', personality: 'Tiny but mighty — big brain, small bird.', desc: 'Lovebird' },
];

const MOODS = {
  idle:{emoji:'    ',label:'daydreaming'},happy:{emoji:' ✨',label:'feeling good'},
  curious:{emoji:' 👀',label:'curious'},sleepy:{emoji:' 💤',label:'getting sleepy'},
  excited:{emoji:' ⚡',label:'excited!'},concern:{emoji:' 💭',label:'noticed something'},
};

const SOUNDS = {
  achilles:[130,165,196],athena:[165,196,220],henry:[262,330,392],
  falcor:[220,275,330],peter:[523,659,784],walter:[880,1047,1175],
};

function rand(a,b){return Math.random()*(b-a)+a}
function pick(a){return a[Math.floor(Math.random()*a.length)]}
function save(k,v){try{localStorage.setItem('wgw-'+k,JSON.stringify(v))}catch(e){}}
function load(k,def){try{const v=localStorage.getItem('wgw-'+k);return v?JSON.parse(v):def}catch(e){return def}}
function playChime(freq=880,dur=0.15,vol=0.08){
  try{
    const ctx=new (window.AudioContext||window.webkitAudioContext)();
    if(ctx.state==='suspended')ctx.resume();
    const o=ctx.createOscillator(),g=ctx.createGain();
    o.type='sine';o.frequency.value=freq;g.gain.value=vol;
    o.connect(g);g.connect(ctx.destination);
    o.start();g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+dur);
    o.stop(ctx.currentTime+dur);
  }catch(e){}
}

function SfxPlayer({petId,enabled}){
  const ctxRef=useRef(null);
  useEffect(()=>{
    if(!enabled)return;
    const i=setInterval(()=>{
      if(Math.random()>0.3)return;
      try{
        if(!ctxRef.current)ctxRef.current=new (window.AudioContext||window.webkitAudioContext)();
        const ctx=ctxRef.current;if(ctx.state==='suspended')ctx.resume();
        const notes=SOUNDS[petId]||SOUNDS.achilles;
        const n=notes[Math.floor(Math.random()*notes.length)];
        const o=ctx.createOscillator();const g=ctx.createGain();
        o.type='sine';o.frequency.value=n;g.gain.value=0.03;
        o.connect(g);g.connect(ctx.destination);
        o.start();g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.3);
        o.stop(ctx.currentTime+0.3);
      }catch(e){}
    },rand(8000,20000));
    return ()=>clearInterval(i);
  },[petId,enabled]);
  return null;
}

export function FloatingPet(){
  const [expanded,setExpanded]=useState(false);
  const [messages,setMessages]=useState(()=>load('chat',[]));
  const [input,setInput]=useState('');
  const [thinking,setThinking]=useState(false);
  const [mood,setMood]=useState('idle');
  const [thought,setThought]=useState(null);
  const [sparkles,setSparkles]=useState([]);
  const [petIdx,setPetIdx]=useState(()=>load('petIdx',0));
  const [cycleMode,setCycleMode]=useState(()=>load('cycle',true));
  const [soundOn,setSoundOn]=useState(()=>load('sound',true));
  const [nudge,setNudge]=useState(null);
  const [stats,setStats]=useState({cost:0,tokens:0,requests:0,providers:[]});
  const [hover,setHover]=useState(false);
  const [showSettings,setShowSettings]=useState(false);
  const [showBrain,setShowBrain]=useState(false);
  const [brainDocs,setBrainDocs]=useState([]);
  const [brainDropActive,setBrainDropActive]=useState(false);
  useEffect(()=>{save('chat',messages)},[messages]);
  const [chatFilter,setChatFilter]=useState('');
  const [brainNote,setBrainNote]=useState('');
  const [brainLoading,setBrainLoading]=useState(false);
  const [pos,setPos]=useState(()=>load('pos',{x:null,y:20}));
  const [drag,setDrag]=useState(null);
  const [visible,setVisible]=useState(()=>load('vis',true));
  const [reminders,setReminders]=useState([]);
  const [dueReminders,setDueReminders]=useState([]);
  const [listening,setListening]=useState(false);
  const [showReminders,setShowReminders]=useState(false);
  const [showGraph,setShowGraph]=useState(false);
  const [userId]=useState(()=>load('userId',crypto.randomUUID()));
  const [userName,setUserName]=useState(()=>load('userName',''));
  const [speakEnabled,setSpeakEnabled]=useState(()=>load('speak',false));
  const [remoteUsers,setRemoteUsers]=useState([]);
  const [notionToken,setNotionToken]=useState(()=>load('notionToken',''));
  const [notionClientId,setNotionClientId]=useState(()=>load('notionClientId',''));
  const [notionClientSecret,setNotionClientSecret]=useState(()=>load('notionClientSecret',''));
  const [notionStatus,setNotionStatus]=useState('');
  const [syncingNotion,setSyncingNotion]=useState(false);
  const [obsidianVault,setObsidianVault]=useState(()=>load('obsidianVault',''));
  const [obsidianStatus,setObsidianStatus]=useState('');
  const [syncingObsidian,setSyncingObsidian]=useState(false);
  const [editingDoc,setEditingDoc]=useState(null);
  const [customPets,setCustomPets]=useState(()=>load('customPets',[]));
  const [creatingPet,setCreatingPet]=useState(false);
  const [newPet,setNewPet]=useState({name:'',emoji:'',glow:'#6366f1',personality:'',desc:'Custom'});
  const [theme,setTheme]=useState(()=>load('theme',{accent:'#6366f1',background:'#0a0a0f'}));
  const bcRef=useRef(null);
  const containerRef=useRef(null);
  const chatRef=useRef(null);
  const inputRef=useRef(null);
  const brainNoteRef=useRef(null);
  const graphCanvasRef=useRef(null);
  const moodTimer=useRef(null);
  const thoughtTimer=useRef(null);
  const sparkleTimer=useRef(null);
  const cycleTimer=useRef(null);
  const nudgeTimer=useRef(null);
  const nudgeDismiss=useRef(null);
  const ydocRef=useRef(null);
  const yproviderRef=useRef(null);

  const allPets=[...PETS,...customPets];
  const pet=allPets[petIdx];
  const moodData=MOODS[mood]||MOODS.idle;
  const isMobile=window.innerWidth<600;
  const panelWidth=isMobile?Math.min(340,window.innerWidth-20):360;

  const updatePos=useCallback((x,y)=>{
    const maxX=(window.innerWidth||1200)-panelWidth;
    const c={x:Math.max(10,Math.min(maxX,x)),y:Math.max(10,Math.min((window.innerHeight||800)-80,y))};
    setPos(c);save('pos',c);
  },[panelWidth]);
  useEffect(()=>{if(pos.x===null)updatePos(window.innerWidth-panelWidth-10,80)},[pos.x,updatePos,panelWidth]);

  // Apply theme to CSS custom properties
  useEffect(()=>{
    const root=document.documentElement;
    root.style.setProperty('--accent',theme.accent);
    root.style.setProperty('--bg',theme.background);
    root.style.setProperty('--theme-color',theme.accent);
  },[theme]);

  // --- Brain API ---
  const loadBrain=useCallback(async()=>{
    try{const r=await fetch(`${API}/pet/brain`);setBrainDocs(await r.json())}catch(e){}
  },[]);
  const addBrainDoc=useCallback(async(title,content,type,permission='private')=>{
    try{await fetch(`${API}/pet/brain`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,content,type,permission})});await loadBrain();setMood('happy');setTimeout(()=>setMood('idle'),2000)}catch(e){}
  },[]);
  const deleteBrainDoc=useCallback(async(id)=>{
    try{await fetch(`${API}/pet/brain/${id}`,{method:'DELETE'});await loadBrain()}catch(e){}
  },[]);
  const togglePin=useCallback(async(id,pinned)=>{
    try{await fetch(`${API}/pet/brain/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({pinned:!pinned})});await loadBrain()}catch(e){}
  },[]);

  // --- Notion / Obsidian Sync ---
  const syncNotion=useCallback(async()=>{
    if(!notionToken){setNotionStatus('Error: No token');return}
    setSyncingNotion(true);setNotionStatus('Pushing...');
    try{
      const r=await fetch(`${API}/pet/notion/sync`,{method:'POST',headers:{'Content-Type':'application/json','x-user-id':userId},body:JSON.stringify({access_token:notionToken})});
      const d=await r.json();setNotionStatus(d.ok?`Pushed ${d.synced}/${d.total} docs`:`Error: ${d.error}`);
    }catch(e){setNotionStatus('Error: '+e.message)}
    finally{setSyncingNotion(false)}
  },[notionToken,userId]);

  const syncNotionBidi=useCallback(async()=>{
    if(!notionToken){setNotionStatus('Error: No token');return}
    setSyncingNotion(true);setNotionStatus('Pulling from Notion...');
    try{
      // Pull first
      const pull=await fetch(`${API}/pet/notion/sync-pull`,{method:'POST',headers:{'Content-Type':'application/json','x-user-id':userId},body:JSON.stringify({access_token:notionToken})});
      const pullData=await pull.json();
      if(!pullData.ok) throw new Error(pullData.error||'Pull failed');
      
      setNotionStatus(`Pulled ${pullData.pulled} docs, ${pullData.conflicts} conflicts`);
      // Then push
      const push=await fetch(`${API}/pet/notion/sync`,{method:'POST',headers:{'Content-Type':'application/json','x-user-id':userId},body:JSON.stringify({access_token:notionToken})});
      const pushData=await push.json();
      setNotionStatus(`↕ Sync complete: pulled ${pullData.pulled}, pushed ${pushData.synced}/${pushData.total}`);
    }catch(e){setNotionStatus('Error: '+e.message)}
    finally{setSyncingNotion(false)}
  },[notionToken,userId]);

  const clearNotion=useCallback(()=>{
    setNotionToken('');save('notionToken','');setNotionStatus('');
  },[]);

  // --- Notion OAuth ---
  const configureNotionOAuth=useCallback(async()=>{
    if(!notionClientId||!notionClientSecret){setNotionStatus('Error: Enter Client ID & Secret');return}
    setNotionStatus('Saving OAuth config...');
    try{
      const r=await fetch(`${API}/pet/notion/oauth/configure`,{method:'POST',headers:{'Content-Type':'application/json','x-user-id':userId},body:JSON.stringify({client_id:notionClientId,client_secret:notionClientSecret})});
      const d=await r.json();setNotionStatus(d.ok?'OAuth config saved':'Error: '+d.error);
    }catch(e){setNotionStatus('Error: '+e.message)}
  },[notionClientId,notionClientSecret,userId]);

  const startNotionOAuth=useCallback(async()=>{
    if(!notionClientId){setNotionStatus('Error: Configure OAuth first');return}
    setSyncingNotion(true);setNotionStatus('Starting OAuth...');
    try{
      const r=await fetch(`${API}/pet/notion/oauth/authorize`,{method:'POST',headers:{'Content-Type':'application/json','x-user-id':userId},body:JSON.stringify({client_id:notionClientId})});
      const d=await r.json();
      if(d.url){
        // Open popup for OAuth
        const popup=window.open(d.url,'notion-oauth','width=500,height=600');
        setNotionStatus('Waiting for authorization...');
        // Listen for callback
        window.addEventListener('message',async(e)=>{
          if(e.data.type==='notion-oauth-callback'){
            if(e.data.token){
              setNotionToken(e.data.token);save('notionToken',e.data.token);
              setNotionStatus('Connected! Token saved.');
            }else if(e.data.error){
              setNotionStatus('Error: '+e.data.error);
            }
            setSyncingNotion(false);
          }
        });
      }else{setNotionStatus('Error: '+d.error);setSyncingNotion(false)}
    }catch(e){setNotionStatus('Error: '+e.message);setSyncingNotion(false)}
  },[notionClientId,userId]);

  const syncObsidian=useCallback(async()=>{
    if(!obsidianVault){setObsidianStatus('Error: No vault path');return}
    setSyncingObsidian(true);setObsidianStatus('Syncing...');
    try{
      const r=await fetch(`${API}/obsidian/sync`,{method:'POST',headers:{'Content-Type':'application/json','x-user-id':userId},body:JSON.stringify({vault_path:obsidianVault})});
      const d=await r.json();setObsidianStatus(d.ok?`Synced ${d.synced}/${d.total} files`:`Error: ${d.error}`);
    }catch(e){setObsidianStatus('Error: '+e.message)}
    finally{setSyncingObsidian(false)}
  },[obsidianVault,userId]);

  const clearObsidian=useCallback(()=>{
    setObsidianVault('');save('obsidianVault','');setObsidianStatus('');
  },[]);

  // --- Drag & Drop ---
  const handleDragOver=useCallback((e)=>{e.preventDefault();setBrainDropActive(true)},[]);
  const handleDragLeave=useCallback(()=>setBrainDropActive(false),[]);
  const handleDrop=useCallback(async(e)=>{
    e.preventDefault();setBrainDropActive(false);
    const files=e.dataTransfer.files;
    if(files.length>0){
      for(const f of files){
        if(f.type.startsWith('text/')||f.name.endsWith('.md')||f.name.endsWith('.txt')||f.name.endsWith('.json')||f.name.endsWith('.js')||f.name.endsWith('.jsx')||f.name.endsWith('.py')||f.name.endsWith('.csv')){
          const text=await f.text();
          const title=f.name.replace(/\.[^/.]+$/,'');
          await addBrainDoc(title,text,'file');
          setThought(`📄 Added ${f.name}`);
          setTimeout(()=>setThought(null),2500);
        }
      }
    }
    const text=e.dataTransfer.getData('text');
    if(text&&files.length===0){
      await addBrainDoc('Pasted Note',text,'text');
      setThought('📝 Note saved!');
      setTimeout(()=>setThought(null),2500);
    }
  },[addBrainDoc]);

  // --- Init brain ---
  useEffect(()=>{loadBrain()},[loadBrain]);

  // --- Graph visualization ---
  const renderGraph=useCallback(()=>{
    const canvas=graphCanvasRef.current;
    if(!canvas||!showGraph)return;
    const ctx=canvas.getContext('2d');
    const dpr=window.devicePixelRatio||1;
    canvas.width=canvas.offsetWidth*dpr;
    canvas.height=canvas.offsetHeight*dpr;
    ctx.scale(dpr,dpr);
    const w=canvas.offsetWidth,h=canvas.offsetHeight;
    // Force-directed layout
    const nodes=brainDocs.map((d,i)=>({id:d.id,x:w*0.5+Math.random()*100,y:h*0.5+Math.random()*100,vx:0,vy:0,title:d.title||'Untitled',pinned:d.pinned,type:d.type}));
    const edges=[];
    // Connect pinned docs to each other
    const pinned=nodes.filter(n=>n.pinned);
    for(let i=0;i<pinned.length;i++)for(let j=i+1;j<pinned.length;j++)edges.push({source:pinned[i].id,target:pinned[j].id});
    // Connect by type similarity
    const byType={};
    nodes.forEach(n=>{if(!byType[n.type])byType[n.type]=[];byType[n.type].push(n)});
    Object.values(byType).forEach(arr=>{for(let i=0;i<arr.length;i++)for(let j=i+1;j<arr.length;j++)if(Math.random()<0.3)edges.push({source:arr[i].id,target:arr[j].id})});
    const nodeMap=Object.fromEntries(nodes.map(n=>[n.id,n]));
    let anim;
    function step(){
      ctx.clearRect(0,0,w,h);
      // Forces
      nodes.forEach(n=>{
        n.vx*=0.9;n.vy*=0.9;
        nodes.forEach(o=>{if(n===o)return;const dx=n.x-o.x,dy=n.y-o.y;const dist=Math.sqrt(dx*dx+dy*dy)||1;const force=500/dist/dist;n.vx+=dx/dist*force;n.vy+=dy/dist*force});
      });
      edges.forEach(e=>{
        const s=nodeMap[e.source],t=nodeMap[e.target];if(!s||!t)return;
        const dx=t.x-s.x,dy=t.y-s.y;const dist=Math.sqrt(dx*dx+dy*dy)||1;
        const force=(dist-100)*0.01;
        s.vx-=dx/dist*force;s.vy-=dy/dist*force;
        t.vx+=dx/dist*force;t.vy+=dy/dist*force;
      });
      nodes.forEach(n=>{if(!n._pinned){n.x+=n.vx;n.y+=n.vy;n.x=Math.max(20,Math.min(w-20,n.x));n.y=Math.max(20,Math.min(h-20,n.y))}});
      // Draw edges
      edges.forEach(e=>{
        const s=nodeMap[e.source],t=nodeMap[e.target];if(!s||!t)return;
        ctx.beginPath();ctx.moveTo(s.x,s.y);ctx.lineTo(t.x,t.y);
        ctx.strokeStyle='#2a2a3a';ctx.lineWidth=1;ctx.stroke();
      });
      // Draw nodes
      nodes.forEach(n=>{
        const isPinned=n.pinned;
        ctx.beginPath();ctx.arc(n.x,n.y,isPinned?10:7,0,Math.PI*2);
        ctx.fillStyle=isPinned?pet.glow:'#1a1a25';ctx.fill();
        ctx.strokeStyle=isPinned?pet.glow:'#3a3a4a';ctx.lineWidth=2;ctx.stroke();
        ctx.fillStyle='#fff';ctx.font='10px sans-serif';ctx.textAlign='center';
        ctx.fillText(n.emoji||(n.type==='file'?'📄':n.type==='note'?'📝':'💬'),n.x,n.y+3);
        ctx.fillStyle='#aaa';ctx.font='9px sans-serif';
        ctx.fillText(n.title.slice(0,16),n.x,n.y+18);
      });
      anim=requestAnimationFrame(step);
    }
    step();
    return ()=>cancelAnimationFrame(anim);
  },[brainDocs,showGraph,pet.glow]);

  useEffect(()=>{if(showGraph){renderGraph()}else if(graphCanvasRef.current){const ctx=graphCanvasRef.current.getContext('2d');ctx?.clearRect(0,0,graphCanvasRef.current.width,graphCanvasRef.current.height)}},[showGraph,brainDocs]);

  // --- Reminders ---
  const loadReminders=useCallback(async()=>{
    try{
      setReminders(await fetch(`${API}/pet/reminders?done=false`).then(r=>r.json()));
      const due=await fetch(`${API}/pet/reminders/due`).then(r=>r.json());
      setDueReminders(due);
      if(due.length>0){
        setThought(`🔔 ${due[0].message}`);
        setTimeout(()=>setThought(null),5000);
        playChime(880,0.15);setTimeout(()=>playChime(1100,0.15),200);
      }
    }catch(e){}
  },[]);
  useEffect(()=>{loadReminders();const i=setInterval(loadReminders,20000);return ()=>clearInterval(i)},[loadReminders]);

  // --- Voice ---
  const startVoice=useCallback(()=>{
    if(!('webkitSpeechRecognition'in window)&&!('SpeechRecognition'in window))return;
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    const rec=new SR();rec.continuous=false;rec.interimResults=false;rec.lang='en-US';
    rec.onresult=(e)=>{setInput(prev=>prev+e.results[0][0].transcript);setListening(false)};
    rec.onend=()=>setListening(false);rec.onerror=()=>setListening(false);
    rec.start();setListening(true);
  },[]);

  // --- BroadcastChannel (multi-tab sync + presence) ---
  useEffect(()=>{
    try{
      bcRef.current=new BroadcastChannel('wgw-pet');
      bcRef.current.onmessage=(e)=>{
        const{type,data}=e.data;
        if(type==='pos')setPos(data);
        if(type==='vis')setVisible(data);
        if(type==='expanded')setExpanded(data);
        if(type==='presence')setOtherUsers(prev=>{const n={...prev,[data.userId]:data};return n});
      };
      // Announce presence
      const presence={userId,userName,petIdx,lastActive:Date.now()};
      bcRef.current.postMessage({type:'presence',data:presence});
      const pi=setInterval(()=>{try{bcRef.current.postMessage({type:'presence',data:{...presence,lastActive:Date.now()}})}catch(e){}},10000);
      return ()=>{clearInterval(pi);try{bcRef.current?.close()}catch(e){}};
    }catch(e){}
  },[userId,userName,petIdx]);

  const [otherUsers,setOtherUsers]=useState({});

  // Broadcast state changes to other tabs
  useEffect(()=>{
    try{bcRef.current?.postMessage({type:'pos',data:pos})}catch(e){}
  },[pos]);
  useEffect(()=>{
    try{bcRef.current?.postMessage({type:'vis',data:visible})}catch(e){}
  },[visible]);
  useEffect(()=>{
    try{bcRef.current?.postMessage({type:'expanded',data:expanded})}catch(e){}
  },[expanded]);
  // persist visibility
  useEffect(()=>{save('vis',visible)},[visible]);

  const refreshStats=useCallback(async()=>{
    try{
      const [d,s]=await Promise.all([
        fetch(`${API}/dashboard`).then(r=>r.json()),
        fetch(`${API}/pet/status`).then(r=>r.json()),
      ]);
      setStats({
        cost:d.today?.cost_today||0,tokens:d.today?.tokens_today||0,
        requests:d.today?.requests_today||0,providers:s.activeProviders||[],
        timeOfDay:s.timeOfDay||'day',
      });
    }catch(e){}
  },[]);

  const getNudge=useCallback(async()=>{
    try{
      const r=await fetch(`${API}/pet/nudge`).then(r=>r.json());
      setNudge(r.nudge);
      if(nudgeDismiss.current)clearTimeout(nudgeDismiss.current);
      nudgeDismiss.current=setTimeout(()=>setNudge(null),8000);
    }catch(e){}
  },[]);

  useEffect(()=>{refreshStats();const i=setInterval(refreshStats,30000);return ()=>clearInterval(i)},[refreshStats]);
  useEffect(()=>{getNudge();nudgeTimer.current=setInterval(getNudge,rand(45000,90000));return ()=>clearInterval(nudgeTimer.current)},[getNudge]);

  useEffect(()=>{
    const es=new EventSource(`${API}/events`);
    es.addEventListener('alert',()=>{setMood('concern');setTimeout(()=>setMood('idle'),4000);getNudge()});
    es.addEventListener('usage',()=>{refreshStats()});
    es.addEventListener('rate-limit',(e)=>{
      try{const d=JSON.parse(e.data);if(d.rpm_remaining!==null&&d.rpm_remaining<10){setMood('concern');setTimeout(()=>setMood('idle'),4000)}}catch(e){}
    });
    es.addEventListener('presence',(e)=>{
      try{const d=JSON.parse(e.data);if(d.users)setRemoteUsers(d.users.filter(u=>u.userId!==userId))}catch(e){}
    });
    return ()=>es.close();
  },[refreshStats,getNudge,userId]);

  // Announce presence periodically
  useEffect(()=>{
    const announce=async()=>{
      try{await fetch(`${API}/presence`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId,userName,petIdx,deviceId:'web'})})}catch(e){}
    };
    announce();
    const i=setInterval(announce,15000);
    return ()=>clearInterval(i);
  },[userId,userName,petIdx]);

  useEffect(()=>{
    const cycle=()=>{
      const moods=['idle','idle','curious','idle','happy','idle'];
      if(stats.requests>50)moods.push('excited');
      const h=new Date().getHours();
      if(h<6||h>22)moods.push('sleepy','sleepy');
      setMood(pick(moods));
    };
    moodTimer.current=setInterval(cycle,rand(6000,18000));
    return ()=>clearInterval(moodTimer.current);
  },[stats]);

  useEffect(()=>{
    if(!cycleMode||expanded)return;
    cycleTimer.current=setInterval(()=>{
      setPetIdx(p=>{const n=(p+1)%allPets.length;save('petIdx',n);return n});
      setMood('happy');setTimeout(()=>setMood('idle'),2000);
    },rand(20000,40000));
    return ()=>clearInterval(cycleTimer.current);
  },[cycleMode,expanded]);

  useEffect(()=>{
    const show=()=>{if(expanded||Math.random()>0.4)return;setThought(pick(['*notices you*','All quiet here.','*happy processor sounds*','Keeping an eye on things.','🧠','Everything nominal.']));setTimeout(()=>setThought(null),3000)};
    thoughtTimer.current=setInterval(show,rand(5000,12000));
    return ()=>clearInterval(thoughtTimer.current);
  },[expanded]);

  useEffect(()=>{
    const spawn=()=>{setSparkles(p=>[...p,{id:Date.now()+Math.random(),x:rand(0,100),y:rand(0,100),s:rand(3,8),d:rand(1,2.5)}].slice(-5))};
    sparkleTimer.current=setInterval(spawn,900);
    return ()=>clearInterval(sparkleTimer.current);
  },[]);
  useEffect(()=>{if(sparkles.length===0)return;const t=setTimeout(()=>setSparkles(p=>p.slice(1)),2000);return ()=>clearTimeout(t)},[sparkles]);

  const driftRef=useRef(null);
  useEffect(()=>{
    if(expanded||drag)return;
    driftRef.current=setInterval(()=>{if(drag||expanded)return;updatePos(pos.x+rand(-3,3),pos.y+rand(-2,2))},4000);
    return ()=>clearInterval(driftRef.current);
  },[expanded,drag,pos,updatePos]);

  useEffect(()=>{if(chatRef.current)chatRef.current.scrollTop=chatRef.current.scrollHeight},[messages,thinking]);
  useEffect(()=>{if(expanded&&inputRef.current)inputRef.current.focus()},[expanded]);
  useEffect(()=>{if(showBrain&&brainNoteRef.current)brainNoteRef.current.focus()},[showBrain]);

  const handleDown=useCallback((e)=>{
    const r=containerRef.current?.getBoundingClientRect();if(!r)return;
    setDrag({ox:e.clientX-r.left,oy:e.clientY-r.top});
  },[]);

  useEffect(()=>{
    if(!drag)return;
    const mv=(e)=>updatePos(e.clientX-drag.ox,e.clientY-drag.oy);
    const up=()=>setDrag(null);
    window.addEventListener('mousemove',mv);window.addEventListener('mouseup',up);
    return ()=>{window.removeEventListener('mousemove',mv);window.removeEventListener('mouseup',up)};
  },[drag,updatePos]);

  useEffect(()=>{
    const hk=(e)=>{if(e.key==='Escape'){if(showBrain)setShowBrain(false);else if(showSettings)setShowSettings(false);else if(expanded)setExpanded(false)}};
    window.addEventListener('keydown',hk);return ()=>window.removeEventListener('keydown',hk);
  },[expanded,showSettings,showBrain]);

  useEffect(()=>{save('chat',messages.slice(-50))},[messages]);

  const handlePet=useCallback(()=>{
    setMood('happy');setThought('😊 Hey!');setTimeout(()=>setMood('idle'),2500);setTimeout(()=>setThought(null),2000);
  },[]);

  const switchPet=useCallback((dir)=>{
    setPetIdx(p=>{const n=((p+dir)+allPets.length)%allPets.length;save('petIdx',n);return n});
    setMood('happy');setTimeout(()=>setMood('idle'),2000);
  },[]);

  const handleNudgeClick=useCallback(()=>{
    setInput(nudge||'');setNudge(null);
    if(nudgeDismiss.current)clearTimeout(nudgeDismiss.current);
  },[nudge]);

  const saveBrainNote=useCallback(async()=>{
    if(!brainNote.trim())return;
    await addBrainDoc('Quick Note',brainNote.trim(),'note');
    setBrainNote('');setBrainLoading(false);
  },[brainNote,addBrainDoc]);

  const speak=useCallback((text)=>{
    if(!speakEnabled)return;
    if('speechSynthesis'in window){
      window.speechSynthesis.cancel();
      const u=new SpeechSynthesisUtterance(text.replace(/[*#\[\]{}()]/g,'').slice(0,300));
      u.rate=1.1;u.pitch=1.0;
      window.speechSynthesis.speak(u);
    }
  },[speakEnabled]);

  const parseReminderIntent=useCallback(async(msg)=>{
    const patterns=[
      /remind me to (.+?) (in|at|tomorrow|next|this)/i,
      /remind me (in|at|tomorrow|next|this) (.+?) to (.+)/i,
      /set a reminder (?:for|to) (.+?) (in|at|tomorrow|next|this)/i,
      /remind me to (.+)/i,
      /remind me about (.+?) (in|at|tomorrow|next|this)/i,
    ];
    let task=null,timeSpec=null;
    for(const p of patterns){
      const m=msg.match(p);
      if(m){
        if(m[3]&&(m[1]==='in'||m[1]==='at'||m[1]==='tomorrow'||m[1]==='next'||m[1]==='this')){task=m[3];timeSpec=m[1]+(m[2]?' '+m[2]:'')}
        else if(m[2]&&(m[2]==='in'||m[2]==='at'||m[2]==='tomorrow'||m[2]==='next'||m[2]==='this')){task=m[1];timeSpec=m[2]+(m[3]?' '+m[3]:'')}
        else if(m[1]&&!m[2]){task=m[1];timeSpec='in 30 minutes'}
        break;
      }
    }
    if(!task)return null;
    // Parse time spec to due_at
    let due_at;
    if(timeSpec.startsWith('in ')){
      const m=timeSpec.match(/in (\d+) (minute|hour|day)s?/);
      if(m){const n=parseInt(m[1]),u=m[2];due_at=new Date(Date.now()+(u==='minute'?n*60000:u==='hour'?n*3600000:n*86400000)).toISOString()}
    }else if(timeSpec.startsWith('tomorrow')){
      const m=timeSpec.match(/(\d+)(?::(\d+))?\s*(am|pm)/i);
      const h=m?parseInt(m[1])+(m[3]&&m[3].toLowerCase()==='pm'&&parseInt(m[1])!==12?12:0):9;
      const min=m&&m[2]?parseInt(m[2]):0;
      const d=new Date();d.setDate(d.getDate()+1);d.setHours(h,min,0,0);due_at=d.toISOString();
    }else if(timeSpec.startsWith('at ')){
      const m=timeSpec.match(/at (\d+)(?::(\d+))?\s*(am|pm)/i);
      if(m){const h=parseInt(m[1])+(m[3]&&m[3].toLowerCase()==='pm'&&parseInt(m[1])!==12?12:0);const min=m[2]?parseInt(m[2]):0;const d=new Date();d.setHours(h,min,0,0);if(d<new Date())d.setDate(d.getDate()+1);due_at=d.toISOString()}
    }
    if(!due_at)due_at=new Date(Date.now()+1800000).toISOString(); // default 30min
    try{
      await fetch(`${API}/pet/reminders`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:task,due_at})});
      loadReminders();
      return `✅ Reminder set: "${task}" at ${new Date(due_at).toLocaleString()}`;
    }catch(e){return null}
  },[loadReminders]);

  const send=async()=>{
    if(!input.trim()||thinking)return;
    const msg=input.trim();setInput('');
    const newMessages=[...messages,{role:'user',content:msg}];
    setMessages(newMessages);setThinking(true);setShowSettings(false);setShowBrain(false);setShowReminders(false);
    try{
      // Check for reminder intent first
      const reminderReply=await parseReminderIntent(msg);
      if(reminderReply){
        setMessages([...newMessages,{role:'assistant',content:reminderReply}]);
        if(speakEnabled)speak(reminderReply);
        setMood('happy');setTimeout(()=>setMood('idle'),2000);
        setThinking(false);
        return;
      }
      const h=messages.map(m=>({role:m.role,content:m.content}));
      const r=await fetch(`${API}/pet/chat`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:msg,history:h})});
      const d=await r.json();if(!r.ok)throw new Error(d.error);
      setMessages([...newMessages,{role:'assistant',content:d.reply}]);
      if(speakEnabled)speak(d.reply);
      setMood('happy');setTimeout(()=>setMood('idle'),2000);
    }catch(e){
      setMessages([...newMessages,{role:'assistant',content:'*brain hiccup* — try again?'}]);
    }finally{setThinking(false)}
  };

  const cx=pos.x!==null?pos.x:20;
  const pinnedDocs=brainDocs.filter(d=>d.pinned);
  const pinnedCount=pinnedDocs.length;

  return (
    <>
      {!visible&&(
        <div onClick={()=>setVisible(true)} style={{
          position:'fixed',bottom:20,right:20,zIndex:9999,cursor:'pointer',
          width:44,height:44,borderRadius:22,background:'var(--surface)',
          border:'1px solid var(--border)',display:'flex',alignItems:'center',
          justifyContent:'center',color:'var(--text-dim)',fontSize:18,
        }}>🧠</div>
      )}

      {/* full-page drop zone */}
      {brainDropActive&&(
        <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} style={{
          position:'fixed',inset:0,zIndex:99999,background:`${pet.glow}15`,
          backdropFilter:'blur(4px)',display:'flex',alignItems:'center',justifyContent:'center',
          flexDirection:'column',gap:16,
        }}>
          <div style={{fontSize:48}}>🧠</div>
          <div style={{fontSize:18,fontWeight:600,color:'var(--text)'}}>Drop into Maria's Brain</div>
          <div style={{fontSize:13,color:'var(--text-dim)'}}>Files, text, code — anything you want remembered</div>
        </div>
      )}

      <div ref={containerRef} style={{
        position:'fixed',left:cx,bottom:pos.y,zIndex:9999,
        fontFamily:"'Inter',-apple-system,system-ui,sans-serif",
        cursor:drag?'grabbing':'default',display:visible?'block':'none',
        transition:drag?'none':'left 0.15s ease,bottom 0.15s ease',
      }}>
        {expanded?(
          <div style={{
            width:panelWidth, minHeight:520, background:'var(--surface)',
            border:'1px solid var(--border)', borderRadius:16,
            display:'flex', flexDirection:'column', overflow:'hidden',
            boxShadow:`0 8px 40px rgba(0,0,0,0.5), 0 0 20px ${pet.glow}22`,
          }}>
            {/* header */}
            <div onMouseDown={handleDown} style={{
              display:'flex',alignItems:'center',justifyContent:'space-between',
              padding:'10px 14px',borderBottom:'1px solid var(--border)',
              cursor:drag?'grabbing':'grab',flexShrink:0,background:'#0a0a0f',
            }}>
              <div style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}
                onClick={(e)=>{e.stopPropagation();switchPet(1)}} title="Click to change pet">
                <div style={{
                  width:32,height:32,borderRadius:16,display:'flex',alignItems:'center',
                  justifyContent:'center',fontSize:16,background:pet.bg,
                  boxShadow:`0 0 12px ${pet.glow}55`,transition:'all 0.3s',
                }}>{pet.emoji}</div>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>{pet.name} <span style={{fontWeight:400,color:'var(--text-dim)',fontSize:11}}>as Maria</span></div>
                  <div style={{fontSize:10,color:pet.glow}}>{moodData.label}</div>
                </div>
              </div>
              <div style={{display:'flex',gap:4,alignItems:'center'}}>
                <span style={{fontSize:10,color:'var(--text-dim)',padding:'2px 6px',background:'#12121a',borderRadius:6,display:'flex',alignItems:'center',gap:3}}>
                  <span style={{width:6,height:6,borderRadius:3,background:'#22c55e',display:'inline-block'}}/>live
                </span>
                <button onClick={(e)=>{e.stopPropagation();setShowBrain(s=>!s);setShowSettings(false);setShowReminders(false)}} style={{
                  ...btnS,color:showBrain?pet.glow:'var(--text-dim)',
                  background:showBrain?`${pet.glow}15`:'transparent',
                }} title="Brain Store">🧠{pinnedCount>0&&<span style={{fontSize:9,marginLeft:1}}>{pinnedCount}</span>}</button>
                <button onClick={(e)=>{e.stopPropagation();setShowReminders(s=>!s);setShowBrain(false);setShowSettings(false);setShowGraph(false)}} style={{
                  ...btnS,color:showReminders?pet.glow:'var(--text-dim)',
                  background:showReminders?`${pet.glow}15`:'transparent',
                }} title="Reminders">⏰{dueReminders.length>0&&<span style={{fontSize:9,marginLeft:1}}>{dueReminders.length}</span>}</button>
                <button onClick={(e)=>{e.stopPropagation();setShowGraph(s=>!s);setShowBrain(false);setShowReminders(false);setShowSettings(false)}} style={{
                  ...btnS,color:showGraph?pet.glow:'var(--text-dim)',
                  background:showGraph?`${pet.glow}15`:'transparent',
                }} title="Knowledge Graph">🕸</button>
                <button onClick={(e)=>{e.stopPropagation();setSpeakEnabled(s=>{const v=!s;save('speak',v);return v})}} style={{
                  ...btnS,color:speakEnabled?'#22c55e':'var(--text-dim)',
                }} title={speakEnabled?'Voice on':'Voice off'}>{speakEnabled?'🔊':'🔇'}</button>
                <span style={{display:'flex',gap:2,alignItems:'center'}} title="Others here">
                  {[
                    ...Object.values(otherUsers).filter(u=>u.userId!==userId),
                    ...remoteUsers.filter(u=>u.userId!==userId)
                  ].slice(0,3).map(u=>
                    <span key={u.userId} style={{fontSize:14,opacity:0.8}}>{allPets[u.petIdx]?.emoji||'👤'}</span>
                  )}
                </span>
                <button onClick={(e)=>{e.stopPropagation();setShowSettings(s=>!s);setShowBrain(false);setShowReminders(false)}} style={btnS}>{showSettings?'✕':'⚙'}</button>
                <button onClick={(e)=>{e.stopPropagation();setExpanded(false)}} style={btnS}>_</button>
                <button onClick={(e)=>{e.stopPropagation();setVisible(false)}} style={btnS}>×</button>
              </div>
            </div>

            {/* brain panel */}
            {showBrain&&(
              <div style={{
                maxHeight:280,overflowY:'auto',borderBottom:'1px solid var(--border)',
                background:'#0e0e16',fontSize:12,
              }}>
                <div style={{padding:'10px 14px 6px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontWeight:600,color:'var(--text)'}}>🧠 Brain Store</span>
                  <span style={{display:'flex',gap:4,alignItems:'center'}}>
                    <span style={{fontSize:10,color:'var(--text-dim)'}}>{brainDocs.length} docs · {pinnedCount} pinned</span>
                    <span onClick={async()=>{const r=await fetch(`${API}/pet/brain/export`).then(r=>r.json());const b=new Blob([JSON.stringify(r,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='sophia-brain-export.json';a.click()}} style={{cursor:'pointer',fontSize:12,color:'var(--text-dim)',padding:'2px 4px'}} title="Export brain">⬇</span>
                    <span onClick={()=>document.getElementById('brain-import-input').click()} style={{cursor:'pointer',fontSize:12,color:'var(--text-dim)',padding:'2px 4px'}} title="Import brain">⬆</span>
                    <input id="brain-import-input" type="file" accept=".json" style={{display:'none'}} onChange={async(e)=>{const f=e.target.files?.[0];if(!f)return;try{const text=await f.text();const docs=JSON.parse(text);const r=await fetch(`${API}/pet/brain/import`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({docs:Array.isArray(docs)?docs:[docs]})}).then(r=>r.json());alert(`Imported ${r.count} documents`);loadBrainDocs()}catch(e){alert('Invalid JSON file')}e.target.value=''}}/>
                  </span>
                </div>

                {/* add note quick */}
                <div style={{padding:'4px 14px 10px',display:'flex',gap:6}}>
                  <input ref={brainNoteRef} value={brainNote} onChange={e=>setBrainNote(e.target.value)}
                    onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();saveBrainNote()}}}
                    placeholder="Quick note to remember..." style={{
                      flex:1,padding:'6px 10px',borderRadius:8,border:'1px solid var(--border)',
                      background:'#12121a',color:'var(--text)',fontSize:12,outline:'none',
                    }}/>
                  <button onClick={saveBrainNote} disabled={!brainNote.trim()} style={{
                    padding:'4px 10px',borderRadius:8,border:'none',
                    background:brainNote.trim()?'var(--accent)':'#2a2a3a',
                    color:'#fff',fontSize:16,cursor:brainNote.trim()?'pointer':'not-allowed',
                    opacity:brainNote.trim()?1:0.4,
                  }}>+</button>
                </div>

                {/* drag hint */}
                <div style={{padding:'0 14px 8px',fontSize:10,color:'var(--text-dim)',display:'flex',gap:6,flexWrap:'wrap'}}>
                  <span style={{padding:'2px 6px',background:'#12121a',borderRadius:4,border:'1px dashed var(--border)'}}>Drop files here</span>
                  <span style={{padding:'2px 6px',background:'#12121a',borderRadius:4,border:'1px dashed var(--border)'}}>Or paste text on the pet</span>
                </div>

                {/* doc list */}
                {brainDocs.length===0&&(
                  <div style={{padding:'20px 14px',textAlign:'center',color:'var(--text-dim)',fontSize:11}}>
                    Your brain is empty. Drop files, paste text, or write notes above.
                  </div>
                )}
                {brainDocs.map(d=>(
                  <div key={d.id} style={{
                    display:'flex',alignItems:'center',gap:8,padding:'7px 14px',
                    borderTop:'1px solid #1a1a25',
                    background:d.pinned?`${pet.glow}08`:'transparent',
                  }}>
                    <span onClick={()=>togglePin(d.id,d.pinned)} style={{
                      cursor:'pointer',fontSize:14,opacity:d.pinned?1:0.3,
                      filter:d.pinned?'none':'grayscale(1)',
                      transition:'all 0.2s',
                    }} title={d.pinned?'Unpin':'Pin to chat context'}>📌</span>
                    <div style={{flex:1,overflow:'hidden'}}>
                      {editingDoc?.id===d.id&&editingDoc?.field==='title'?(
                        <input autoFocus value={editingDoc.val} onChange={e=>setEditingDoc({...editingDoc,val:e.target.value})}
                          onBlur={()=>{fetch(`${API}/pet/brain/${d.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:editingDoc.val})}).then(()=>{loadBrainDocs();setEditingDoc(null)})}}
                          onKeyDown={e=>{if(e.key==='Enter'){e.target.blur()}if(e.key==='Escape')setEditingDoc(null)}}
                          style={{width:'100%',padding:'2px 6px',borderRadius:4,border:'1px solid var(--accent)',background:'#12121a',color:'var(--text)',fontSize:12,outline:'none'}}/>
                      ):(
                        <div onClick={()=>setEditingDoc({id:d.id,field:'title',val:d.title||''})} style={{fontSize:12,color:'var(--text)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',cursor:'text'}}>
                          {d.title||'Untitled'}
                        </div>
                      )}
                      {editingDoc?.id===d.id&&editingDoc?.field==='content'?(
                        <CollabEditor docId={d.id} initialContent={editingDoc.val} userName={userName} onSave={async(content)=>{
                          await fetch(`${API}/pet/brain/${d.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({content})});
                          loadBrainDocs();setEditingDoc(null);
                        }} onCancel={()=>setEditingDoc(null)} />
                      ):(
                        <div onClick={()=>setEditingDoc({id:d.id,field:'content',val:d.content||''})} style={{fontSize:10,color:'var(--text-dim)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',cursor:'text'}}>
                          {d.content.slice(0,80)}{d.content.length>80?'...':''}
                        </div>
                      )}
                    </div>
                    <span style={{fontSize:9,color:'var(--text-dim)',padding:'2px 5px',background:'#12121a',borderRadius:4,textTransform:'uppercase'}}>
                      {d.type==='file'?'📄':d.type==='note'?'📝':'💬'}
                    </span>
                    <select value={d.permission||'private'} onChange={e=>{fetch(`${API}/pet/brain/${d.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({permission:e.target.value})}).then(()=>loadBrain())}} style={{fontSize:9,padding:'2px 6px',borderRadius:4,border:'1px solid var(--border)',background:'#12121a',color:'var(--text)',outline:'none'}}>
                      <option value="private">🔒 Private</option>
                      <option value="shared">👥 Shared</option>
                      <option value="public">🌐 Public</option>
                    </select>
                    <span onClick={()=>deleteBrainDoc(d.id)} style={{
                      cursor:'pointer',fontSize:14,color:'var(--text-dim)',opacity:0.5,
                      padding:'2px',borderRadius:4,
                    }} title="Delete">🗑</span>
                  </div>
                ))}
              </div>
            )}

            {/* settings panel */}
            {showSettings&&!showBrain&&(
              <div style={{padding:'10px 14px',borderBottom:'1px solid var(--border)',background:'#0e0e16',fontSize:12}}>
                <div style={{fontWeight:600,color:'var(--text)',marginBottom:8}}>Settings</div>
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',color:'var(--text-dim)'}}>
                    <input type="text" value={userName} onChange={e=>{const v=e.target.value;setUserName(v);save('userName',v)}} placeholder="Your name" style={{flex:1,padding:'6px 8px',borderRadius:6,border:'1px solid var(--border)',background:'#12121a',color:'var(--text)',outline:'none',fontSize:12}}/>
                  </label>
                  <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',color:'var(--text-dim)'}}>
                    <input type="checkbox" checked={soundOn} onChange={e=>{setSoundOn(e.target.checked);save('sound',e.target.checked)}} style={{accentColor:'var(--accent)'}}/>
                    Ambient sounds
                  </label>
                  <div style={{color:'var(--text-dim)',marginTop:4}}>
                    Current: <strong style={{color:pet.glow}}>{pet.name}</strong> — {pet.desc}
                    <div style={{display:'flex',gap:4,marginTop:4,flexWrap:'wrap'}}>
                      {PETS.map((p,i)=>(
                        <span key={p.id} onClick={()=>{setPetIdx(i);save('petIdx',i);setCycleMode(false);save('cycle',false)}}
                          style={{cursor:'pointer',fontSize:18,opacity:i===petIdx?1:0.4,transition:'opacity 0.2s',
                            filter:i===petIdx?'none':'grayscale(0.5)'}}>{p.emoji}</span>
                      ))}
                      {customPets.map((p,ci)=>(
                        <span key={p.id} onClick={()=>{setPetIdx(PETS.length+ci);save('petIdx',PETS.length+ci);setCycleMode(false);save('cycle',false)}}
                          style={{cursor:'pointer',fontSize:18,opacity:(PETS.length+ci)===petIdx?1:0.4,transition:'opacity 0.2s',
                            filter:(PETS.length+ci)===petIdx?'none':'grayscale(0.5)'}}>{p.emoji}</span>
                      ))}
                    </div>
                    {customPets.length>0&&<div style={{fontSize:10,color:'var(--text-dim)',marginTop:4}}>Custom pets: {customPets.map(p=>p.emoji+' '+p.name).join(', ')}</div>}
                  </div>

                  {/* Theme picker */}
                  <div style={{marginTop:8,paddingTop:8,borderTop:'1px solid var(--border)'}}>
                    <div style={{fontWeight:600,color:'var(--text)',fontSize:11,marginBottom:4}}>🎨 Theme</div>
                    <div style={{display:'flex',flexDirection:'column',gap:4}}>
                      <div style={{display:'flex',gap:4,alignItems:'center'}}>
                        <span style={{fontSize:10,color:'var(--text-dim)',width:50}}>Accent</span>
                        <input type="color" value={theme.accent} onChange={e=>{const t={...theme,accent:e.target.value};setTheme(t);save('theme',t)}} style={{width:40,height:28,border:'none',borderRadius:4,cursor:'pointer',background:'transparent'}}/>
                        <input type="text" value={theme.accent} onChange={e=>{const t={...theme,accent:e.target.value};setTheme(t);save('theme',t)}} style={{flex:1,padding:'4px 8px',borderRadius:4,border:'1px solid var(--border)',background:'#12121a',color:'var(--text)',outline:'none',fontSize:11,textTransform:'uppercase'}}/>
                      </div>
                      <div style={{display:'flex',gap:4,alignItems:'center'}}>
                        <span style={{fontSize:10,color:'var(--text-dim)',width:50}}>Background</span>
                        <input type="color" value={theme.background} onChange={e=>{const t={...theme,background:e.target.value};setTheme(t);save('theme',t)}} style={{width:40,height:28,border:'none',borderRadius:4,cursor:'pointer',background:'transparent'}}/>
                        <input type="text" value={theme.background} onChange={e=>{const t={...theme,background:e.target.value};setTheme(t);save('theme',t)}} style={{flex:1,padding:'4px 8px',borderRadius:4,border:'1px solid var(--border)',background:'#12121a',color:'var(--text)',outline:'none',fontSize:11,textTransform:'uppercase'}}/>
                      </div>
                      <div style={{display:'flex',gap:4}}>
                        <button onClick={()=>{const t={accent:'#6366f1',background:'#0a0a0f'};setTheme(t);save('theme',t)}} style={{flex:1,padding:'4px 8px',borderRadius:4,border:'none',background:'var(--accent)',color:'#fff',fontSize:10,cursor:'pointer'}}>Default</button>
                        <button onClick={()=>{const t={accent:'#22c55e',background:'#0a0a0f'};setTheme(t);save('theme',t)}} style={{flex:1,padding:'4px 8px',borderRadius:4,border:'none',background:'#22c55e',color:'#fff',fontSize:10,cursor:'pointer'}}>Green</button>
                        <button onClick={()=>{const t={accent:'#f97316',background:'#0a0a0f'};setTheme(t);save('theme',t)}} style={{flex:1,padding:'4px 8px',borderRadius:4,border:'none',background:'#f97316',color:'#fff',fontSize:10,cursor:'pointer'}}>Orange</button>
                        <button onClick={()=>{const t={accent:'#a855f7',background:'#0a0a0f'};setTheme(t);save('theme',t)}} style={{flex:1,padding:'4px 8px',borderRadius:4,border:'none',background:'#a855f7',color:'#fff',fontSize:10,cursor:'pointer'}}>Purple</button>
                      </div>
                    </div>
</div>

                  {/* Integrations */}
                  <div style={{marginTop:8,paddingTop:8,borderTop:'1px solid var(--border)'}}>
                    <div style={{fontWeight:600,color:'var(--text)',fontSize:11,marginBottom:4}}>🔗 Integrations</div>
                      <label style={{fontSize:10,color:'var(--text-dim)'}}>Notion OAuth</label>
                      <div style={{display:'flex',flexDirection:'column',gap:4}}>
                        <div style={{display:'flex',gap:4}}>
                          <input value={notionClientId} onChange={e=>{const v=e.target.value;setNotionClientId(v);save('notionClientId',v)}} placeholder="Client ID" style={{flex:1,padding:'6px 8px',borderRadius:6,border:'1px solid var(--border)',background:'#12121a',color:'var(--text)',outline:'none',fontSize:11}}/>
                          <input type="password" value={notionClientSecret} onChange={e=>{const v=e.target.value;setNotionClientSecret(v);save('notionClientSecret',v)}} placeholder="Client Secret" style={{flex:1,padding:'6px 8px',borderRadius:6,border:'1px solid var(--border)',background:'#12121a',color:'var(--text)',outline:'none',fontSize:11}}/>
                          <button onClick={configureNotionOAuth} disabled={!notionClientId||!notionClientSecret} style={{...btnS,fontSize:10,padding:'4px 8px'}}>Save Config</button>
                        </div>
                        <div style={{display:'flex',gap:4}}>
                          <button onClick={startNotionOAuth} disabled={!notionClientId||syncingNotion} style={{...btnS,fontSize:10,padding:'4px 8px',flex:1}}>{syncingNotion?'⏳':'🔐 Connect'}</button>
                          <button onClick={syncNotionBidi} disabled={!notionToken||syncingNotion} style={{...btnS,fontSize:10,padding:'4px 8px'}}>{syncingNotion?'⏳':'↕ Sync'}</button>
                          <button onClick={clearNotion} style={{...btnS,fontSize:10,padding:'4px 8px',background:'#2a2a3a'}}>✕</button>
                        </div>
                        {notionStatus&&<div style={{fontSize:10,color:notionStatus.includes('Error')?'#f97316':'#22c55e'}}>{notionStatus}</div>}
                      </div>
                    </div>

                    {/* Obsidian */}
                    <div style={{display:'flex',flexDirection:'column',gap:4,marginTop:8}}>
                      <label style={{fontSize:10,color:'var(--text-dim)'}}>Obsidian Vault Path</label>
                      <div style={{display:'flex',gap:4}}>
                        <input value={obsidianVault} onChange={e=>{const v=e.target.value;setObsidianVault(v);save('obsidianVault',v)}} placeholder="/Users/you/Vault" style={{flex:1,padding:'6px 8px',borderRadius:6,border:'1px solid var(--border)',background:'#12121a',color:'var(--text)',outline:'none',fontSize:11}}/>
                        <button onClick={syncObsidian} disabled={syncingObsidian} style={{...btnS,fontSize:10,padding:'4px 8px'}}>{syncingObsidian?'⏳':'📁 Sync'}</button>
                        <button onClick={clearObsidian} style={{...btnS,fontSize:10,padding:'4px 8px',background:'#2a2a3a'}}>✕</button>
                      </div>
                      {obsidianStatus&&<div style={{fontSize:10,color:obsidianStatus.includes('Error')?'#f97316':'#22c55e'}}>{obsidianStatus}</div>}
                    </div>
                  </div>

                  {/* Create Pet */}
                  <div style={{marginTop:8,paddingTop:8,borderTop:'1px solid var(--border)'}}>
                    <button onClick={()=>setCreatingPet(true)} style={{...btnS,fontSize:11,padding:'4px 8px'}}>+ Create Pet</button>
                    {creatingPet&&(
                      <div style={{display:'flex',flexDirection:'column',gap:6,marginTop:6,fontSize:11}}>
                        <input value={newPet.name} onChange={e=>setNewPet({...newPet,name:e.target.value})} placeholder="Name" style={{padding:'6px 8px',borderRadius:6,border:'1px solid var(--border)',background:'#12121a',color:'var(--text)',outline:'none'}}/>
                        <input value={newPet.emoji} onChange={e=>setNewPet({...newPet,emoji:e.target.value})} placeholder="Emoji (🐕, 🦄, etc)" style={{padding:'6px 8px',borderRadius:6,border:'1px solid var(--border)',background:'#12121a',color:'var(--text)',outline:'none'}}/>
                        <input value={newPet.glow} onChange={e=>setNewPet({...newPet,glow:e.target.value})} placeholder="Glow color (hex)" style={{padding:'6px 8px',borderRadius:6,border:'1px solid var(--border)',background:'#12121a',color:'var(--text)',outline:'none'}}/>
                        <input value={newPet.personality} onChange={e=>setNewPet({...newPet,personality:e.target.value})} placeholder="Personality description" style={{padding:'6px 8px',borderRadius:6,border:'1px solid var(--border)',background:'#12121a',color:'var(--text)',outline:'none'}}/>
                        <input value={newPet.desc} onChange={e=>setNewPet({...newPet,desc:e.target.value})} placeholder="Short description" style={{padding:'6px 8px',borderRadius:6,border:'1px solid var(--border)',background:'#12121a',color:'var(--text)',outline:'none'}}/>
                        <div style={{display:'flex',gap:4}}>
                          <button onClick={()=>{const id='custom-'+Date.now();setCustomPets([...customPets,{id,...newPet}]);save('customPets',[...customPets,{id,...newPet}]);setCreatingPet(false);setNewPet({name:'',emoji:'',glow:'#6366f1',personality:'',desc:'Custom'});setPetIdx(allPets.length);save('petIdx',allPets.length);setCycleMode(false);save('cycle',false)}} style={{...btnS,flex:1,fontSize:11}}>Save</button>
                          <button onClick={()=>{setCreatingPet(false);setNewPet({name:'',emoji:'',glow:'#6366f1',personality:'',desc:'Custom'})}} style={{...btnS,flex:1,fontSize:11,background:'#2a2a3a'}}>Cancel</button>
                        </div>
                      </div>
                    )}
</div>
                </div>
              )}

            {/* reminders panel */}
            {showReminders&&!showBrain&&!showSettings&&(
              <div style={{maxHeight:220,overflowY:'auto',borderBottom:'1px solid var(--border)',background:'#0e0e16',fontSize:12}}>
                <div style={{padding:'8px 14px',display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'1px solid #1a1a25'}}>
                  <span style={{fontWeight:600,color:'var(--text)',fontSize:12}}>⏰ Reminders</span>
                  <span style={{fontSize:10,color:'var(--text-dim)'}}>{reminders.length+dueReminders.length} total</span>
                </div>
                {dueReminders.length>0&&(
                  <div style={{padding:'4px 14px',fontSize:10,color:'#f97316',fontWeight:600}}>DUE NOW</div>
                )}
                {dueReminders.map(r=>(
                  <div key={r.id} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 14px',background:'#f9731611'}}>
                    <span style={{fontSize:12}}>🔔</span>
                    <div style={{flex:1,fontSize:11,color:'var(--text)'}}>{r.message}</div>
                    <span onClick={()=>{fetch(`${API}/pet/reminders/${r.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({done:true})}).then(loadReminders)}} style={{padding:'2px 6px',borderRadius:4,background:'#22c55e',color:'#000',fontSize:9,cursor:'pointer',fontWeight:600}}>Done</span>
                  </div>
                ))}
                <div style={{padding:'4px 14px',fontSize:10,color:'var(--text-dim)',fontWeight:600}}>UPCOMING</div>
                {reminders.filter(r=>!dueReminders.find(d=>d.id===r.id)).map(r=>(
                  <div key={r.id} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 14px',borderTop:'1px solid #1a1a25'}}>
                    <span style={{fontSize:11,color:'var(--text-dim)'}}>⏰</span>
                    <div style={{flex:1}}>
                      <div style={{fontSize:11,color:'var(--text)'}}>{r.message}</div>
                      <div style={{fontSize:9,color:'var(--text-dim)'}}>{r.due_at}</div>
                    </div>
                    <span onClick={()=>{fetch(`${API}/pet/reminders/${r.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({done:true})}).then(loadReminders)}} style={{padding:'2px 6px',borderRadius:4,background:'#12121a',color:'var(--text-dim)',fontSize:9,cursor:'pointer'}}>✓</span>
                    <span onClick={()=>{fetch(`${API}/pet/reminders/${r.id}`,{method:'DELETE'}).then(loadReminders)}} style={{cursor:'pointer',fontSize:12,color:'var(--text-dim)',opacity:0.4}}>✕</span>
                  </div>
                ))}
                {reminders.length===0&&dueReminders.length===0&&<div style={{padding:20,textAlign:'center',color:'var(--text-dim)',fontSize:11}}>No reminders yet.</div>}
              </div>
            )}

            {/* graph panel */}
            {showGraph&&!showBrain&&!showSettings&&!showReminders&&(
              <div style={{height:280,borderBottom:'1px solid var(--border)',background:'#0e0e16'}}>
                <div style={{padding:'8px 14px',display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'1px solid #1a1a25'}}>
                  <span style={{fontWeight:600,color:'var(--text)',fontSize:12}}>🕸 Knowledge Graph</span>
                  <span style={{fontSize:10,color:'var(--text-dim)'}}>{brainDocs.length} nodes</span>
                </div>
                <canvas ref={graphCanvasRef} style={{width:'100%',height:'100%',display:'block'}}></canvas>
              </div>
            )}

            {/* chat */}
            <div ref={chatRef} style={{flex:1,overflowY:'auto',padding:12,display:'flex',flexDirection:'column',gap:8}}>
              <input value={chatFilter} onChange={e=>setChatFilter(e.target.value)} placeholder="🔍 Search chat..." style={{padding:'6px 10px',borderRadius:8,border:'1px solid var(--border)',background:'#12121a',color:'var(--text)',fontSize:12,outline:'none',marginBottom:4}}/>
              {messages.length===0&&!thinking&&(
                <div style={{textAlign:'center',color:'var(--text-dim)',fontSize:13,padding:'24px 16px',lineHeight:1.7}}>
                  <div style={{fontSize:28,marginBottom:6}}>{pet.emoji}</div>
                  <div style={{fontWeight:500,color:'var(--text)',fontSize:14}}>Hey, I'm {pet.name}!</div>
                  <div style={{fontSize:11,marginTop:4,color:pet.glow}}>{pet.personality}</div>
                  {pinnedCount>0&&<div style={{fontSize:10,marginTop:8,color:pet.glow,padding:'4px 10px',background:`${pet.glow}11`,borderRadius:8,display:'inline-block'}}>📌 {pinnedCount} pinned brain doc{pinnedCount>1?'s':''} in context</div>}
                  <div style={{marginTop:14,display:'flex',gap:6,justifyContent:'center',flexWrap:'wrap'}}>
                    {['Help me plan my day','Check AI costs','Tell me something','How are you?'].map((q,i)=>(
                      <button key={i} onClick={()=>setInput(q)} style={{
                        padding:'5px 10px',fontSize:11,borderRadius:8,border:'1px solid var(--border)',
                        background:'#12121a',color:'var(--text-dim)',cursor:'pointer',
                      }}>{q}</button>
                    ))}
                  </div>
                </div>
              )}
              {messages.filter(m=>!chatFilter||m.content.toLowerCase().includes(chatFilter.toLowerCase())).map((m,i)=>(
                <div key={i} style={{display:'flex',justifyContent:m.role==='user'?'flex-end':'flex-start'}}>
                  <div style={{
                    maxWidth:'85%',padding:'9px 13px',borderRadius:12,fontSize:13,lineHeight:1.5,
                    background:m.role==='user'?'var(--accent)':'#1a1a25',
                    color:m.role==='user'?'#fff':'var(--text)',
                    borderBottomRightRadius:m.role==='user'?4:12,
                    borderBottomLeftRadius:m.role==='user'?12:4,
                    whiteSpace:'pre-wrap',wordBreak:'break-word',
                  }}>{m.content}</div>
                </div>
              ))}
              {thinking&&(
                <div style={{display:'flex',justifyContent:'flex-start'}}>
                  <div style={{padding:'10px 14px',borderRadius:12,fontSize:13,background:'#1a1a25',borderBottomLeftRadius:4}}>
                    <span style={{display:'inline-flex',gap:3}}>
                      {[0,1,2].map(i=><span key={i} style={{width:6,height:6,borderRadius:3,background:pet.glow,
                        animation:`wgwPop 1.2s ease-in-out infinite`,animationDelay:`${i*0.2}s`}}/>)}
                    </span>
                  </div>
                </div>
              )}
              <style>{`@keyframes wgwPop{0%,100%{transform:scale(0.6);opacity:0.3}50%{transform:scale(1);opacity:1}}`}</style>
            </div>

            {/* stats bar */}
            <div style={{display:'flex',gap:10,padding:'5px 14px',borderTop:'1px solid var(--border)',background:'#0e0e16',fontSize:10,color:'var(--text-dim)',alignItems:'center'}}>
              <span>💵 ${stats.cost.toFixed(4)}</span>
              <span>📊 {stats.tokens>=1e6?(stats.tokens/1e6).toFixed(1)+'M':stats.tokens>=1e3?(stats.tokens/1e3).toFixed(1)+'K':stats.tokens}</span>
              <span>📨 {stats.requests}</span>
              {pinnedCount>0&&<span style={{marginLeft:'auto',color:pet.glow,fontSize:10}}>🧠 {pinnedCount}</span>}
              <span style={{display:'flex',gap:2}}>{stats.providers.map(p=><span key={p} style={{opacity:0.6}}>{p[0].toUpperCase()}</span>)}</span>
            </div>

            {/* input */}
            <div style={{display:'flex',gap:8,padding:'10px 12px 12px',borderTop:'1px solid var(--border)',background:'#0a0a0f'}}>
              <input ref={inputRef} value={input} onChange={e=>setInput(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}}
                placeholder={`Ask ${pet.name} anything...`} disabled={thinking}
                style={{flex:1,padding:'8px 12px',borderRadius:10,border:'1px solid var(--border)',
                  background:'#12121a',color:'var(--text)',fontSize:13,outline:'none'}}/>
              <button onClick={startVoice} style={{
                padding:'6px 10px',borderRadius:8,border:'none',
                background:listening?'#22c55e':'#12121a',color:listening?'#000':'var(--text-dim)',
                cursor:'pointer',fontSize:14,
              }} title="Voice input">{listening?'🔴':'🎤'}</button>
              <button onClick={send} disabled={thinking||!input.trim()} style={{
                padding:'8px 14px',borderRadius:10,border:'none',
                background:thinking?'#2a2a3a':'var(--accent)',color:'#fff',
                fontSize:16,cursor:thinking||!input.trim()?'not-allowed':'pointer',
                opacity:!input.trim()&&!thinking?0.5:1,
              }}>➤</button>
            </div>
          </div>
        ):(
          <>
            {/* nudge bar */}
            {nudge&&(
              <div onClick={handleNudgeClick} style={{
                position:'absolute',bottom:68,left:'50%',transform:'translateX(-50%)',
                background:'#1a1a25',border:`1px solid ${pet.glow}44`,borderRadius:12,
                padding:'8px 14px',fontSize:11,color:'var(--text-dim)',maxWidth:240,
                cursor:'pointer',animation:'wgwFadeIn 0.3s ease',
                boxShadow:`0 4px 16px rgba(0,0,0,0.3), 0 0 12px ${pet.glow}11`,
                whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',
              }}>
                <div style={{position:'absolute',bottom:-5,left:'50%',transform:'translateX(-50%)',
                  width:0,height:0,borderLeft:'5px solid transparent',borderRight:'5px solid transparent',
                  borderTop:`5px solid #1a1a25`}}/>
                💡 {nudge}
              </div>
            )}

            {/* thought bubble */}
            {thought&&!nudge&&(
              <div style={{
                position:'absolute',bottom:64,left:'50%',transform:'translateX(-50%)',
                background:'#1a1a25',border:'1px solid var(--border)',borderRadius:12,
                padding:'6px 12px',fontSize:11,color:'var(--text-dim)',
                whiteSpace:'nowrap',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',
                animation:'wgwFadeIn 0.3s ease',boxShadow:'0 4px 16px rgba(0,0,0,0.3)',
              }}>
                <div style={{position:'absolute',bottom:-5,left:'50%',transform:'translateX(-50%)',
                  width:0,height:0,borderLeft:'5px solid transparent',borderRight:'5px solid transparent',
                  borderTop:'5px solid #1a1a25'}}/>
                {thought}
              </div>
            )}

            {/* sparkles */}
            {sparkles.map(s=>(
              <div key={s.id} style={{
                position:'absolute',left:`${s.x}%`,top:`${s.y}%`,width:s.s,height:s.s,
                borderRadius:'50%',background:pet.glow,opacity:0.35,
                animation:`wgwSparkle ${s.d}s ease-out forwards`,pointerEvents:'none',
              }}/>
            ))}

            {/* main pet orb — now with drop zone */}
            <div
              onMouseDown={handleDown}
              onClick={()=>setExpanded(true)}
              onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}
              onDoubleClick={handlePet}
              onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
              style={{
                width:brainDropActive?72:hover?60:56,
                height:brainDropActive?72:hover?60:56,
                borderRadius:'50%',background:pet.bg,
                display:'flex',alignItems:'center',justifyContent:'center',
                cursor:drag?'grabbing':'pointer',
                boxShadow:brainDropActive
                  ?`0 0 0 4px ${pet.glow},0 0 40px ${pet.glow}66`
                  :`0 4px 24px ${pet.glow}44,0 0 60px ${pet.glow}22`,
                animation:brainDropActive?'none':'wgwIdle 3s ease-in-out infinite',
                transition:'all 0.25s ease',position:'relative',
                flexDirection:'column',lineHeight:1,
              }} title={`${pet.name} — drop files or text to save to brain`}>
              <span style={{fontSize:brainDropActive?28:hover?24:22,transition:'font-size 0.2s',lineHeight:1}}>
                {brainDropActive?'📥':pet.emoji}
              </span>
              {!brainDropActive&&<span style={{fontSize:8,color:'rgba(255,255,255,0.7)',marginTop:moodData.emoji? -4:-2,lineHeight:1}}>{moodData.emoji}</span>}

              {/* pinned indicator */}
              {pinnedCount>0&&!brainDropActive&&(
                <div style={{position:'absolute',top:-4,right:-4,width:16,height:16,borderRadius:8,
                  background:pet.glow,display:'flex',alignItems:'center',justifyContent:'center',
                  fontSize:9,color:'#000',fontWeight:700,boxShadow:'0 2px 6px rgba(0,0,0,0.3)'
                }}>{pinnedCount}</div>
              )}

              {/* activity ring */}
              {!brainDropActive&&(
                <svg style={{position:'absolute',inset:-3,width:'calc(100%+6px)',height:'calc(100%+6px)',transform:'rotate(-90deg)'}}>
                  <circle cx="50%" cy="50%" r="50%" fill="none" stroke={pet.glow} strokeWidth="2"
                    strokeDasharray={`${Math.min((stats.requests%100)*3,300)} 300`} opacity="0.5"
                    style={{transition:'all 0.5s'}}/>
                </svg>
              )}
            </div>

            <SfxPlayer petId={pet.id} enabled={soundOn}/>

            <style>{`
              @keyframes wgwIdle{0%,100%{transform:translateY(0) scale(1)}25%{transform:translateY(-4px) scale(1.02)}50%{transform:translateY(-2px) scale(1)}75%{transform:translateY(-6px) scale(1.01)}}
              @keyframes wgwFadeIn{from{opacity:0;transform:translateX(-50%) translateY(6px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
              @keyframes wgwSparkle{0%{opacity:0.4;transform:scale(0)}50%{opacity:0.5;transform:scale(1.2)}100%{opacity:0;transform:scale(0) translateY(-8px)}}
            `}</style>
          </>
        )}
      </div>
    </>
  );
}

const btnS={background:'transparent',border:'none',color:'var(--text-dim)',cursor:'pointer',fontSize:14,padding:2,lineHeight:1,borderRadius:4,width:24,height:24};
