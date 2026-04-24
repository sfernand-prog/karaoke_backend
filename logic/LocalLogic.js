import Local from '../models/Local.js';

// Crear el local (solo la entidad)
export const createLocalLogic = async (localData) => {
  const { localId, localName, address, adminEmail } = localData;
  const newLocal = new Local({
    localId,
    name: localName,
    address,
    adminEmail
  });
  return await newLocal.local.save();
};

// Obtener info de un local
export const getLocalByIdLogic = async (localId) => {
  return await Local.findOne({ localId });
};

// Actualizar info del local
export const updateLocalInfoLogic = async (localId, updateData) => {
  return await Local.findOneAndUpdate({ localId }, updateData, { new: true });
};