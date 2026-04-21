import mongoose from 'mongoose';

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

export default mongoose.model('Song', SongSchema);