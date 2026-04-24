import mongoose from 'mongoose';

const SessionSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true, 
    unique: true 
  }, // Ej: "SALÓN VIP", "SEGUNDO PISO"
  localId: { 
    type: String, 
    required: true, 
    index: true 
  },
  status: { 
    type: String, 
    enum: ['active', 'inactive', 'archived'], 
    default: 'inactive' 
  },
  qrData: { 
    type: String 
  }, // URL que contendrá el QR para los clientes
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  // models/Session.js (Añade estos campos a tu esquema)
averageTime: { 
  type: Number, 
  default: 300000 // 5 minutos en milisegundos por defecto
},
lastSingTimestamp: { 
  type: Date, 
  default: null 
}
}, { timestamps: true });

export default mongoose.model('Session', SessionSchema);