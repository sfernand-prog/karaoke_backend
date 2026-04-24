import express from 'express';
import Song from '../models/Song.js';
import { getOrderedQueue, getSingingList, emitQueue, addSongLogic, adjustPriorityLogic } from '../logic/ListLogic.js';

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

  // 3. Ajustar prioridad (Debe ir antes de /:id para no cruzar rutas)
  router.post('/adjust-priority', async (req, res) => {
    try {
      const { songId, direction } = req.body;
      const sessionId = await adjustPriorityLogic(songId, direction);
      await emitQueue(io, sessionId);
      res.sendStatus(200);
    } catch (error) {
      console.error("Error al ajustar prioridad:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // 4. Cantar (Mover a singing)
  router.post('/:id/sing', async (req, res) => {
    try {
      
      const songToSing = await Song.findById(req.params.id);
      if (!songToSing) return res.status(404).json({ error: "Canción no encontrada" });

      // Finalizar las que estén cantando EN ESA SESIÓN
      await Song.updateMany(
        { status: 'singing', sessionId: songToSing.sessionId }, 
        { $set: { status: 'finished' } }
      );

      const song = await Song.findByIdAndUpdate(
        req.params.id, 
        { status: 'singing', updatedAt: new Date() },
        { new: true }
      );
      
      // Activar la siguiente del mismo usuario en la misma sesión
      const nextInLine = await Song.findOne({ 
        status: 'waiting', 
        sessionId: song.sessionId,
        virtualTimestamp: null,
        $or: [{ name: song.name }, { deviceId: song.deviceId }]
      }).sort({ createdAt: 1 });

      if (nextInLine) {
        nextInLine.virtualTimestamp = new Date();
        await nextInLine.save();
      }

      await emitQueue(io, song.sessionId);
      res.json(song);
    } catch (error) {
      console.error("Error en POST /:id/sing:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // 5. Eliminar canción
  router.delete('/:id', async (req, res) => {
    try {
      const songToDelete = await Song.findById(req.params.id);
      if (!songToDelete) return res.status(404).json({ error: "Canción no encontrada" });

      const sId = songToDelete.sessionId;
      const deletedTime = songToDelete.virtualTimestamp;
      
      await Song.findByIdAndDelete(req.params.id);

      const nextInLine = await Song.findOne({ 
        status: 'waiting', 
        sessionId: sId,
        virtualTimestamp: null,
        $or: [{ name: songToDelete.name }, { deviceId: songToDelete.deviceId }]
      }).sort({ createdAt: 1 });

      if (nextInLine && deletedTime) {
        nextInLine.virtualTimestamp = deletedTime;
        await nextInLine.save();
      }

      await emitQueue(io, sId);
      res.sendStatus(204);
    } catch (error) {
      console.error("Error en DELETE /:id:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};