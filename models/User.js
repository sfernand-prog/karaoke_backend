import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['super', 'admin', 'dj'], required: true },
  // Referencia única: solo guardamos el localId
  associatedLocalId: { type: String, index: true } 
}, { timestamps: true });

export default mongoose.model('User', UserSchema);