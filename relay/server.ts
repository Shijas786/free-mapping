// ─── WebMapper DMX Art-Net & OSC UDP Relay ────────────────────────────────────
// Run with: npx ts-node relay/server.ts (or node relay/server.js)

import { WebSocketServer, WebSocket } from 'ws';
import * as dgram from 'dgram';

const PORT = 8080;
const wss = new WebSocketServer({ port: PORT });
const udpSocket = dgram.createSocket('udp4');

console.log(`📡 WebMapper Relay active on ws://localhost:${PORT}`);
console.log(`🔌 Bridging browser WebSocket ↔ Art-Net (UDP :6454) & OSC (UDP :9000)`);

wss.on('connection', (ws: WebSocket) => {
  console.log('✅ WebMapper browser connected');

  ws.on('message', (message: Buffer) => {
    try {
      const data = JSON.parse(message.toString());

      if (data.type === 'artnet') {
        // Send Art-Net DMX packet over UDP to target IP (default broadcast 255.255.255.255:6454)
        const universe = data.universe ?? 0;
        const dmxData: number[] = data.channels; // Array of 512 channel values [0-255]

        const header = Buffer.from([
          65, 114, 116, 45, 78, 101, 116, 0, // "Art-Net\0"
          0, 80,                             // OpOutput / OpDmx (0x5000)
          0, 14,                             // ProtVer (14)
          0,                                 // Sequence
          0,                                 // Physical
          universe & 0xff, (universe >> 8) & 0xff, // Universe
          (dmxData.length >> 8) & 0xff, dmxData.length & 0xff, // Length
        ]);

        const packet = Buffer.concat([header, Buffer.from(dmxData)]);
        const targetIp = data.ip ?? '255.255.255.255';
        udpSocket.send(packet, 6454, targetIp);
      }
    } catch (err) {
      console.error('Relay error:', err);
    }
  });

  ws.on('close', () => console.log('❌ WebMapper browser disconnected'));
});
