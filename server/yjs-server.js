import ws from 'ws';
import http from 'http';
import * as Y from 'yjs';

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'yjs', timestamp: Date.now() }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const WebSocketServer = ws.Server;
const wss = new WebSocketServer({ server });
const PORT = process.env.PORT || 1234;

server.listen(PORT, () => {
  console.log(`Yjs WebSocket server running on ws://localhost:${PORT}`);
  console.log(`Health check available at http://localhost:${PORT}/health`);
});

const docs = new Map();

function setupWSConnection(ws, req, { docName }) {
  let doc = docs.get(docName);
  if (!doc) {
    doc = new Y.Doc();
    docs.set(docName, doc);
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  function send(message) {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  function handleMessage(data) {
    try {
      const message = JSON.parse(decoder.decode(data));
      if (message.type === 'sync') {
        // Step 1: send current state
        const stateVector = Y.encodeStateVector(doc);
        send({ type: 'sync', state: Y.encodeStateAsUpdate(doc, stateVector) });
      } else if (message.type === 'update') {
        // Apply remote update
        Y.applyUpdate(doc, message.update);
        // Broadcast to other clients
        wss.clients.forEach(client => {
          if (client !== ws && client.readyState === ws.OPEN) {
            client.send(JSON.stringify({ type: 'update', update: message.update }));
          }
        });
      } else if (message.type === 'awareness') {
        // Broadcast awareness (cursor, selection, etc.)
        wss.clients.forEach(client => {
          if (client !== ws && client.readyState === ws.OPEN) {
            client.send(JSON.stringify({ type: 'awareness', ...message }));
          }
        });
      }
    } catch (e) {
      console.error('Error handling message:', e);
    }
  }

  ws.on('message', handleMessage);

  ws.on('close', () => {
    // Optional: cleanup awareness
  });

  // Send initial sync
  send({ type: 'sync', state: Y.encodeStateAsUpdate(doc) });
}

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const docName = url.searchParams.get('doc') || 'brain';
  setupWSConnection(ws, req, { docName });
});

console.log('Yjs WebSocket server running on ws://localhost:1234');