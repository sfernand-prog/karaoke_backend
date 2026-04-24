import User from '../models/User.js';
import Local from '../models/Local.js';
import crypto from 'crypto';

// Generar un ID de local único (Facade interno)
const generateUniqueLocalId = () => {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
};

export const registerLocalAdminLogic = async (userData) => {
  const { name, email, password, localName, address } = userData;
  const localId = generateUniqueLocalId();

  console.log("\n>>> INICIANDO REGISTRO DE LOCAL Y ADMIN <<<");
  console.log(`Datos: Email=${email}, Local=${localName}, ID_Generado=${localId}`);

  try {
    // 1. Crear el Local en su propia colección
    const newLocal = new Local({
      localId,
      name: localName,
      address,
      adminEmail: email
    });
    console.log("kk1: Guardando Local...");
    await newLocal.save();

    // 2. Crear el Usuario Admin vinculado por ID
    const newAdmin = new User({
      name,
      email: email.toLowerCase(),
      password, 
      role: 'admin',
      associatedLocalId: localId 
    });
    console.log("kk2: Guardando Admin...");
    
    return await newAdmin.save();
  } catch (error) {
    console.error("!!! ERROR EN LÓGICA DE REGISTRO !!!");
    console.error("Mensaje:", error.message);
    throw error;
  }
};

export const registerDjLogic = async (djData) => {
  const { name, email, password, localId } = djData;

  // FIX: Validar que el local existe en la colección 'locals'
  const localExists = await Local.findOne({ localId });
  if (!localExists) throw new Error("LOCAL_NOT_FOUND");

  const newDj = new User({
    name,
    email: email.toLowerCase(),
    password,
    role: 'dj',
    associatedLocalId: localId
  });

  return await newDj.save();
};

// FIX: Usamos Agregación para traer la info del local que ahora está en otra tabla
export const getLocalsListLogic = async () => {
  return await User.aggregate([
    { $match: { role: 'admin' } },
    {
      $lookup: {
        from: 'locals', // nombre de la colección en MongoDB
        localField: 'associatedLocalId',
        foreignField: 'localId',
        as: 'localInfo'
      }
    },
    { 
      $addFields: { 
        localInfo: { $arrayElemAt: ["$localInfo", 0] } 
      } 
    },
    { $project: { password: 0 } }
  ]);
};

export const getDjsByLocalLogic = async (localId) => {
  return await User.find({ role: 'dj', associatedLocalId: localId }).select('-password');
};

export const loginUserLogic = async (email, password) => {
  console.log("\n=========================================");
  console.log(">>> NUEVO INTENTO DE LOGIN <<<");
  
  const rootUserEnv = process.env.ROOT_USER || 'root';
  const rootPassEnv = process.env.ROOT_PASSWORD;

  if (email === rootUserEnv && password === rootPassEnv) {
    console.log("LOGIN STATUS: Exitoso como SUPERADMIN");
    return {
      name: 'Super Administrador',
      email: rootUserEnv,
      role: 'super',
      localInfo: { localId: 'ALL' }
    };
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  
  if (!user || user.password !== password) {
    console.log("LOGIN STATUS: Fallido.");
    throw new Error("INVALID_CREDENTIALS");
  }

  console.log(`LOGIN STATUS: Exitoso. Rol: ${user.role}`);
  return user;
};

export const updateUserLogic = async (id, updateData) => {
  console.log(`>>> ACTUALIZANDO USUARIO: ${id}`);
  const { name, email, password } = updateData;
  
  const updated = await User.findByIdAndUpdate(
    id,
    { name, email, password },
    { new: true }
  );
  
  if (!updated) throw new Error("USER_NOT_FOUND");
  return updated;
};

export const deleteDjLogic = async (id) => {
  console.log(`>>> ELIMINANDO DJ: ${id}`);
  const deleted = await User.findByIdAndDelete(id);
  if (!deleted) throw new Error("USER_NOT_FOUND");
  return deleted;
};