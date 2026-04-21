import User from '../models/User.js';
import crypto from 'crypto';

// Generar un ID de local único (Facade interno)
const generateUniqueLocalId = () => {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
};

export const registerLocalAdminLogic = async (userData) => {
  const { name, email, password, localName, address } = userData;
  
  const localId = generateUniqueLocalId();

  const newAdmin = new User({
    name,
    email,
    password, // Idealmente aplicar hash aquí
    role: 'admin',
    localInfo: { localId, name: localName, address }
  });

  return await newAdmin.save();
};

export const registerDjLogic = async (djData) => {
  const { name, email, password, localId } = djData;

  // Validar que el local al que se intenta asociar existe
  const localExists = await User.findOne({ "localInfo.localId": localId });
  if (!localExists) throw new Error("LOCAL_NOT_FOUND");

  const newDj = new User({
    name,
    email,
    password,
    role: 'dj',
    associatedLocalId: localId
  });

  return await newDj.save();
};

export const getLocalsListLogic = async () => {
  return await User.find({ role: 'admin' }).select('-password');
};

export const getDjsByLocalLogic = async (localId) => {
  return await User.find({ role: 'dj', associatedLocalId: localId }).select('-password');
};