import { WebSocketServer } from 'ws';
import * as Y from 'yjs';
import { setupWSConnection } from 'y-websocket/bin/utils.js';

const wss = new WebSocketServer({ port: 1234 });

const docs = new Map();

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const docName = url.searchParams.get('doc') || 'brain';
  
  if (!docs.has(docName)) {
    docs.set(docName, new Y.Doc());
  }
  
  setupWSConnection(ws, req, { docName, gc: true });
});

console.log('Yjs WebSocket server running on ws://localhost:1234');