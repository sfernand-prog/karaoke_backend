import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("¡Conectado a MongoDB Atlas! 🚀"))
  .catch((err) => console.error("Error de conexión:", err));

// 1. Schema con DeviceId
const SongSchema = new mongoose.Schema({
  name: String,
  song: String,
  deviceId: String, // <--- Nuevo campo
  status: { type: String, default: 'waiting' },
  boostTime: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  virtualTimestamp: { type: Date } 
});

const Song = mongoose.model('Song', SongSchema);

// --- 2. Lógica de Ordenamiento Pro (Evita que los NULL salgan primero) ---
const getOrderedQueue = async () => {
  return await Song.aggregate([
    { $match: { status: 'waiting' } },
    {
      $addFields: {
        // Marcamos con 1 si está en pausa, con 0 si está activo
        isPaused: { $cond: { if: { $eq: ["$virtualTimestamp", null] }, then: 1, else: 0 } }
      }
    },
    {
      $sort: {
        isPaused: 1,          // Primero los activos (0), luego los pausados (1)
        virtualTimestamp: 1,  // El que más ha esperado arriba
        createdAt: 1          // Desempate por orden de inscripción
      }
    }
  ]);
};

// Helper para emitir a todos los clientes
const emitQueue = async () => {
  const queue = await getOrderedQueue();
  io.emit('update_queue', queue);
};

// --- 3. Rutas de la API ---

// Obtener toda la fila
app.get('/api/queue', async (req, res) => {
  try {
    const queue = await getOrderedQueue();
    res.json(queue);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener la fila" });
  }
});

// 2. POST validando tanto Nombre como DeviceId
app.post('/api/queue', async (req, res) => {
  try {
    const { name, song, deviceId } = req.body;
    const now = new Date();

    // BUSCAMOS SI EL NOMBRE O EL DISPOSITIVO YA TIENEN ALGO ACTIVO
    const userHasActive = await Song.findOne({ 
      status: 'waiting',
      virtualTimestamp: { $ne: null },
      $or: [ { name: name }, { deviceId: deviceId } ] // <--- El candado doble
    });

    const newSong = new Song({
      name,
      song,
      deviceId,
      createdAt: now,
      virtualTimestamp: userHasActive ? null : now 
    });

    await newSong.save();
    await emitQueue();
    res.status(201).json(newSong);
  } catch (error) {
    res.status(400).json({ error: "Error al agregar" });
  }
});
// Boost de tiempo
app.post('/api/queue/boost', async (req, res) => {
  try {
    const { songId, minutesToBuy } = req.body;
    const msToSubtract = minutesToBuy * 60 * 1000;

    const song = await Song.findById(songId);
    
    if (song && song.virtualTimestamp) {
      song.virtualTimestamp = new Date(song.virtualTimestamp.getTime() - msToSubtract);
      song.boostTime += msToSubtract;
      await song.save();
      await emitQueue();
      res.json({ success: true });
    } else {
      res.status(400).json({ error: "No se puede dar boost a una canción en pausa" });
    }
  } catch (error) {
    res.status(500).json({ error: "Error en boost" });
  }
});

// --- 4. Socket.io ---
io.on('connection', async (socket) => {
  console.log('Nuevo cliente conectado 📱:', socket.id);
  const queue = await getOrderedQueue();
  socket.emit('update_queue', queue);
});

// --- 5. Iniciar el servidor ---
const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`Servidor backend corriendo en http://localhost:${PORT}`);
});