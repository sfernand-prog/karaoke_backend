import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['super', 'admin', 'dj'], required: true },
  localInfo: {
    localId: { type: String, unique: true, sparse: true },
    name: String,
    address: String
  },
  associatedLocalId: { type: String } 
}, { timestamps: true });

export default mongoose.model('User', UserSchema);