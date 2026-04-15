import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const httpServer = createServer(app);

// --- 1. Configuración de Seguridad (CORS) ---
const allowedOrigins = [
  "http://localhost:5173", 
  "https://karaoke-frontend-nine.vercel.app"
];

const io = new Server(httpServer, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// --- 2. Conexión a MongoDB ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("¡Conectado a MongoDB Atlas! 🚀"))
  .catch((err) => console.error("Error de conexión:", err));

// --- 3. Modelo de Datos ---
const SongSchema = new mongoose.Schema({
  name: String,
  song: String,
  deviceId: String, 
  status: { type: String, default: 'waiting' }, // waiting, singing, finished
  boostTime: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  virtualTimestamp: { type: Date } 
});

const Song = mongoose.model('Song', SongSchema);

// --- 4. Lógica de Consultas ---

// Obtiene la fila de espera (activos primero, luego pausados)
const getOrderedQueue = async () => {
  return await Song.aggregate([
    { $match: { status: 'waiting' } },
    {
      $addFields: {
        isPaused: { $cond: { if: { $eq: ["$virtualTimestamp", null] }, then: 1, else: 0 } }
      }
    },
    {
      $sort: {
        isPaused: 1,          
        virtualTimestamp: 1,  
        createdAt: 1          
      }
    }
  ]);
};

// Obtiene quién está cantando actualmente
const getSingingList = async () => {
  return await Song.find({ status: 'singing' }).sort({ updatedAt: -1 });
};

// Emite ambas listas a todos los clientes conectados
const emitQueue = async () => {
  const queue = await getOrderedQueue();
  const singing = await getSingingList();
  io.emit('update_queue', { queue, singing });
};

// --- 5. Rutas de la API ---

app.get('/api/queue', async (req, res) => {
  try {
    const queue = await getOrderedQueue();
    const singing = await getSingingList();
    res.json({ queue, singing });
  } catch (error) {
    res.status(500).json({ error: "Error al obtener la fila" });
  }
});

app.post('/api/queue', async (req, res) => {
  try {
    const { name, song, deviceId } = req.body;
    const now = new Date();

    const userHasActive = await Song.findOne({ 
      status: 'waiting',
      virtualTimestamp: { $ne: null },
      $or: [ { name: name }, { deviceId: deviceId } ] 
    });

    const newSong = new Song({
      name,
      song,
      deviceId,
      createdAt: now,
      updatedAt: now,
      virtualTimestamp: userHasActive ? null : now 
    });

    await newSong.save();
    await emitQueue();
    res.status(201).json(newSong);
  } catch (error) {
    res.status(400).json({ error: "Error al agregar" });
  }
});

// NUEVO ENDPOINT: Pasar a cantar
app.post('/api/queue/:id/sing', async (req, res) => {
  try {
    // 1. Finalizar cualquier canción que estuviera en 'singing'
    await Song.updateMany({ status: 'singing' }, { $set: { status: 'finished' } });

    // 2. Mover la canción seleccionada a 'singing'
    const song = await Song.findByIdAndUpdate(
      req.params.id, 
      { status: 'singing', updatedAt: new Date() }, 
      { new: true }
    );

    if (!song) return res.status(404).json({ error: "Canción no encontrada" });

    // 3. Activar la siguiente canción del mismo usuario/dispositivo
    const nextInLine = await Song.findOne({ 
      status: 'waiting', 
      virtualTimestamp: null,
      $or: [ { name: song.name }, { deviceId: song.deviceId } ]
    }).sort({ createdAt: 1 });

    if (nextInLine) {
      nextInLine.virtualTimestamp = new Date();
      await nextInLine.save();
    }

    await emitQueue();
    res.json(song);
  } catch (error) {
    res.status(500).json({ error: "Error al pasar a cantar" });
  }
});

app.post('/api/queue/boost', async (req, res) => {
  try {
    const { songId, minutesToBuy } = req.body;
    const msToSubtract = minutesToBuy * 60 * 1000;
    const song = await Song.findById(songId);
    
    if (song && song.virtualTimestamp) {
      song.virtualTimestamp = new Date(song.virtualTimestamp.getTime() - msToSubtract);
      song.boostTime += msToSubtract;
      song.updatedAt = new Date();
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

app.delete('/api/queue/:id', async (req, res) => {
  try {
    const { by } = req.query; 
    const songToDelete = await Song.findById(req.params.id);
    
    if (!songToDelete) return res.sendStatus(404);

    const userName = songToDelete.name;
    const devId = songToDelete.deviceId;
    const deletedTime = songToDelete.virtualTimestamp;

    await Song.findByIdAndDelete(req.params.id);

    const nextInLine = await Song.findOne({ 
      status: 'waiting', 
      virtualTimestamp: null,
      $or: [ { name: userName }, { deviceId: devId } ]
    }).sort({ createdAt: 1 });

    if (nextInLine) {
      nextInLine.virtualTimestamp = (by === 'user' && deletedTime) ? deletedTime : new Date();
      await nextInLine.save();
    }

    await emitQueue();
    res.sendStatus(204);
  } catch (error) {
    res.status(500).json({ error: "Error en el borrado" });
  }
});

// --- 6. Eventos de Socket.io ---
io.on('connection', async (socket) => {
  console.log('Nuevo cliente conectado 📱:', socket.id);
  const queue = await getOrderedQueue();
  const singing = await getSingingList();
  socket.emit('update_queue', { queue, singing });
});

// --- 7. Iniciar el servidor ---
const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor backend corriendo en el puerto ${PORT}`);
});