import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const httpServer = createServer(app);

// --- 1. Configuración de Socket.io con CORS para Producción ---
const io = new Server(httpServer, {
  cors: {
    // Agrega aquí todas las URLs de Vercel que vayas generando
    origin: [
      "http://localhost:5173", 
      "https://karaoke-frontend-efztwadsa-sfernand-progs-projects.vercel.app"
    ],
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// --- 2. Conexión a MongoDB (Usa la variable de entorno de Render/Local) ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("¡Conectado a MongoDB Atlas! 🚀"))
  .catch((err) => console.error("Error de conexión:", err));

// --- 3. Modelo de Datos ---
const SongSchema = new mongoose.Schema({
  name: String,
  song: String,
  deviceId: String, 
  status: { type: String, default: 'waiting' },
  boostTime: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  virtualTimestamp: { type: Date } // null = En Pausa
});

const Song = mongoose.model('Song', SongSchema);

// --- 4. Lógica de Ordenamiento (Activos arriba, Pausados abajo) ---
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

const emitQueue = async () => {
  const queue = await getOrderedQueue();
  io.emit('update_queue', queue);
};

// --- 5. Rutas de la API ---

app.get('/api/queue', async (req, res) => {
  try {
    const queue = await getOrderedQueue();
    res.json(queue);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener la fila" });
  }
});

app.post('/api/queue', async (req, res) => {
  try {
    const { name, song, deviceId } = req.body;
    const now = new Date();

    // CANDADO DOBLE: Bloquea por nombre o por dispositivo (ID del fierro)
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
      virtualTimestamp: userHasActive ? null : now 
    });

    await newSong.save();
    await emitQueue();
    res.status(201).json(newSong);
  } catch (error) {
    res.status(400).json({ error: "Error al agregar" });
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

// RUTA DE BORRADO (DJ y Usuario)
app.delete('/api/queue/:id', async (req, res) => {
  try {
    const { by } = req.query; // 'dj' o 'user'
    const songToDelete = await Song.findById(req.params.id);
    
    if (!songToDelete) return res.sendStatus(404);

    const userName = songToDelete.name;
    const devId = songToDelete.deviceId;
    const deletedTime = songToDelete.virtualTimestamp;

    await Song.findByIdAndDelete(req.params.id);

    // Activar la siguiente canción del mismo usuario/dispositivo
    const nextInLine = await Song.findOne({ 
      status: 'waiting', 
      virtualTimestamp: null,
      $or: [ { name: userName }, { deviceId: devId } ]
    }).sort({ createdAt: 1 });

    if (nextInLine) {
      // Herencia si borra el usuario, Reinicio si borra el DJ (ya cantó)
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
  socket.emit('update_queue', queue);
});

// --- 7. Iniciar el servidor (Configuración para Hosting) ---
const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor backend corriendo en el puerto ${PORT}`);
});