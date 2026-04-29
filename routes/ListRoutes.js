import express from 'express';
import Song from '../models/Song.js';
import { 
  getOrderedQueue, 
  getSingingList, 
  emitQueue, 
  addSongLogic, 
  adjustPriorityLogic, 
  markSongAsSingingLogic,
  deleteUserSongsLogic // Nueva importación
} from '../logic/ListLogic.js';

const router = express.Router();

export default (io) => {
  // 1. Obtener cola
  router.get('/', async (req, res) => {
    try {
      const { sessionId } = req.query;
      if (!sessionId) return res.status(400).json({ error: "Falta sessionId" });
      
      const queue = await getOrderedQueue(sessionId);
      const singing = await getSingingList(sessionId);
      res.json({ queue, singing });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // 2. Agregar canción
  router.post('/', async (req, res) => {
    try {
      const newSong = await addSongLogic(req.body);
      await emitQueue(io, req.body.sessionId);
      res.status(201).json(newSong);
    } catch (error) {
      console.error("Error al agregar canción:", error.message);
      res.status(400).json({ error: error.message });
    }
  });

  // 3. Ajustar prioridad
  router.post('/adjust-priority', async (req, res) => {
    try {
      const { songId, direction } = req.body;
      const sessionId = await adjustPriorityLogic(songId, direction);
      await emitQueue(io, sessionId);
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // 4. Marcar canción para cantar
  router.post('/:id/sing', async (req, res) => {
    try {
      const song = await markSongAsSingingLogic(req.params.id);
      await emitQueue(io, song.sessionId);
      res.json(song);
    } catch (error) {
      console.error("Error en POST /:id/sing:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // 5. Eliminar canción individual
  router.delete('/:id', async (req, res) => {
    try {
      const songToDelete = await Song.findById(req.params.id);
      if (!songToDelete) return res.status(404).json({ error: "Canción no encontrada" });

      const sId = songToDelete.sessionId;
      const deletedTime = songToDelete.virtualTimestamp;
      const dId = songToDelete.deviceId;
      const uName = songToDelete.name;
      
      await Song.findByIdAndDelete(req.params.id);

      // Lógica de "Justicia": Activar la siguiente si la borrada estaba activa
      if (deletedTime) {
        const nextInLine = await Song.findOne({ 
          status: 'waiting', 
          sessionId: sId,
          virtualTimestamp: null,
          $or: [{ name: uName }, { deviceId: dId }]
        }).sort({ createdAt: 1 });

        if (nextInLine) {
          nextInLine.virtualTimestamp = deletedTime;
          await nextInLine.save();
        }
      }

      await emitQueue(io, sId);
      res.sendStatus(204);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // 6. NUEVO: Borrar todas las canciones de un usuario en la sesión
  router.delete('/user/:deviceId', async (req, res) => {
    try {
      const { deviceId } = req.params;
      const { sessionId } = req.query; // Recibimos el sessionId por query string

      if (!sessionId) {
        return res.status(400).json({ error: "DEVICE_ID_AND_SESSION_ID_REQUIRED" });
      }

      await deleteUserSongsLogic(deviceId, sessionId);
      
      // Emitimos la actualización a todos en la sala
      await emitQueue(io, sessionId);
      
      res.json({ message: "Todas las canciones del usuario han sido eliminadas" });
    } catch (error) {
      console.error("Error en DELETE /user/:deviceId:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};