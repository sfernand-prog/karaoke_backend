import express from 'express';
import Song from '../models/Song.js';
import { getOrderedQueue, getSingingList, emitQueue } from '../logic/listLogic.js';

const router = express.Router();

export default (io) => {
  router.get('/', async (req, res) => {
    const queue = await getOrderedQueue();
    const singing = await getSingingList();
    res.json({ queue, singing });
  });

  router.post('/', async (req, res) => {
    const { name, song, deviceId } = req.body;
    const now = new Date();
    const userHasActive = await Song.findOne({ 
      status: 'waiting', 
      virtualTimestamp: { $ne: null },
      $or: [{ name }, { deviceId }] 
    });

    const newSong = new Song({
      name, song, deviceId,
      createdAt: now, updatedAt: now,
      virtualTimestamp: userHasActive ? null : now 
    });

    await newSong.save();
    await emitQueue(io);
    res.status(201).json(newSong);
  });

  router.post('/:id/sing', async (req, res) => {
    await Song.updateMany({ status: 'singing' }, { $set: { status: 'finished' } });
    const song = await Song.findByIdAndUpdate(req.params.id, { status: 'singing', updatedAt: new Date() });
    
    const nextInLine = await Song.findOne({ 
      status: 'waiting', virtualTimestamp: null,
      $or: [{ name: song.name }, { deviceId: song.deviceId }]
    }).sort({ createdAt: 1 });

    if (nextInLine) {
      nextInLine.virtualTimestamp = new Date();
      await nextInLine.save();
    }
    await emitQueue(io);
    res.json(song);
  });

  router.delete('/:id', async (req, res) => {
    const songToDelete = await Song.findById(req.params.id);
    if (!songToDelete) return res.sendStatus(404);

    const deletedTime = songToDelete.virtualTimestamp;
    await Song.findByIdAndDelete(req.params.id);

    const nextInLine = await Song.findOne({ 
      status: 'waiting', virtualTimestamp: null,
      $or: [{ name: songToDelete.name }, { deviceId: songToDelete.deviceId }]
    }).sort({ createdAt: 1 });

    if (nextInLine && deletedTime) {
      nextInLine.virtualTimestamp = deletedTime;
      await nextInLine.save();
    }
    await emitQueue(io);
    res.sendStatus(204);
  });

  return router;
};