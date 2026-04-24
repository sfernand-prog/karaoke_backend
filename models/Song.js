import mongoose from 'mongoose';

const SongSchema = new mongoose.Schema({
  name: { type: String, required: true },
  song: { type: String, required: true },
  deviceId: { type: String, required: true },
  localId: { type: String, required: true, index: true },
  // REFERENCIA A LA SESIÓN ACTIVA
  sessionId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Session', 
    required: true, 
    index: true 
  },
  status: { type: String, default: 'waiting' },
  boostTime: { type: Number, default: 0 },
  // MARCADOR DE JUSTICIA
  adjustmentMarker: { 
    type: String, 
    enum: ['normal', 'advanced', 'delayed'], 
    default: 'normal' 
  },
  createdAt: { type: Date, default: Date.now },
  virtualTimestamp: { type: Date } 
}, { timestamps: true });

export default mongoose.model('Song', SongSchema);