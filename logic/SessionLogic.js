import Session from '../models/Session.js';

/**
 * Obtiene todas las sesiones de un local que no estén archivadas.
 * Se cambió el nombre para coincidir con el import en SessionRoutes.js
 */
export const getSessionsByLocalLogic = async (localId) => {
  return await Session.find({ 
    localId, 
    status: { $ne: 'archived' } 
  }).sort({ createdAt: -1 });
};

/**
 * Crea una nueva sesión (ambiente) para un local específico.
 */
export const createSessionLogic = async (sessionData) => {
  const { name, localId } = sessionData;
  
  const newSession = new Session({
    name: name.toUpperCase().trim(),
    localId,
    status: 'inactive' // Inicia inactiva por defecto
  });

  return await newSession.save();
};

/**
 * Activa una sesión específica y genera la URL para el código QR.
 */
export const activateSessionLogic = async (sessionId) => {
  // Generamos la URL que el QR debe contener (apuntando a tu puerto de frontend 5173)
  const qrData = `http://localhost:5173/?session=${sessionId}`; 
  
  return await Session.findByIdAndUpdate(
    sessionId, 
    { 
      status: 'active', 
      qrData 
    }, 
    { new: true }
  );
};

/**
 * Mueve una sesión al estado 'archived'. 
 * Las sesiones archivadas solo son visibles para el Administrador del Local o Root.
 */
export const archiveSessionLogic = async (sessionId) => {
  return await Session.findByIdAndUpdate(
    sessionId, 
    { status: 'archived' }, 
    { new: true }
  );
};