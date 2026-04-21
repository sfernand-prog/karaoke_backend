import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Importación de Rutas
import listRoutes from './routes/listRoutes.js';
import userRoutes from './routes/userRoutes.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Middleware
app.use(cors());
app.use(express.json());

// Inyección de Rutas
app.use('/api/users', userRoutes);
app.use('/api/queue', listRoutes(io)); // Pasamos 'io' para que la lógica emita cambios

// MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("DB Conectada y Refactorizada 🚀"))
  .catch((err) => console.error(err));

// Sockets
io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);
});

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Server en puerto ${PORT}`);
});