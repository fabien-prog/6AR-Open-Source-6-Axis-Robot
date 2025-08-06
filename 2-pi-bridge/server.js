// server.js
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

import initUARTService from './UARTService.js';
import initIKService from './IKService.js';
import initSocketService from './SocketService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('[Server] Starting up…');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// serve React build
app.use(express.static(path.join(__dirname, 'public')));

// initialize hardware and IK services
const uartService = initUARTService(io);
const ikService = initIKService(io, uartService.writeTeensy);

// wire up all Socket.IO handlers
initSocketService(
  io,
  ikService.requestIk,
  ikService.sendLinearMove,
  uartService.writeTeensy,
  uartService.TIMEOUTS
);

server.listen(5000, '0.0.0.0', () => {
  console.log('[Server] Listening on 0.0.0.0:5000');
});
