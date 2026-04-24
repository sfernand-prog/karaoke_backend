import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Importación de Rutas
import listRoutes from './routes/ListRoutes.js';
import userRoutes from './routes/UserRoutes.js';
import sessionRoutes from './routes/SessionRoutes.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Middleware
app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  if (req.method === 'POST') console.log("Body recibido:", req.body);
  next();
});

// Inyección de Rutas
app.use('/api/users', userRoutes);
app.use('/api/list', listRoutes(io)); // Pasamos 'io' para que la lógica emita cambios
app.use('/api/sessions', sessionRoutes);

// MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("DB Conectada y Refactorizada 🚀"))
  .catch((err) => console.error(err));

// Sockets
io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);

  // Escuchar cuando un cliente (DJ o Usuario) pide entrar a su ambiente
  socket.on('join_session', (sessionId) => {
    socket.join(sessionId.toString());
    console.log(`Socket ${socket.id} se unió a la sesión ${sessionId}`);
  });

  // Escuchar cuando el cliente sale de la vista
  socket.on('leave_session', (sessionId) => {
    socket.leave(sessionId.toString());
    console.log(`Socket ${socket.id} abandonó la sesión ${sessionId}`);
  });
});

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Server en puerto ${PORT}`);
});