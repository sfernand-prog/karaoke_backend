import mongoose from 'mongoose';

const LocalSchema = new mongoose.Schema({
  localId: { type: String, required: true, unique: true }, // El ID corto (725F30B9)
  name: { type: String, required: true },
  address: { type: String },
  adminEmail: { type: String, required: true }, // Referencia lógica al dueño
  config: {
    maxQueueSize: { type: Number, default: 20 },
    isSubscriptionActive: { type: Boolean, default: true }
  }
}, { timestamps: true });

export default mongoose.model('Local', LocalSchema);