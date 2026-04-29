import Song from '../models/Song.js';
import Session from '../models/Session.js';
import mongoose from 'mongoose';

// 1. Obtener cola de espera filtrada por SESIÓN
export const getOrderedQueue = async (sessionId) => {
  return await Song.aggregate([
    { 
      $match: { 
        status: 'waiting', 
        sessionId: new mongoose.Types.ObjectId(sessionId) 
      } 
    },
    {
      $addFields: {
        isPaused: { $cond: { if: { $eq: ["$virtualTimestamp", null] }, then: 1, else: 0 } }
      }
    },
    { $sort: { isPaused: 1, virtualTimestamp: 1, createdAt: 1 } }
  ]);
};

// 2. Obtener lista de los que están cantando en esta SESIÓN
export const getSingingList = async (sessionId) => {
  return await Song.find({ 
    status: 'singing', 
    sessionId 
  }).sort({ updatedAt: -1 });
};

// 3. Emitir actualizaciones por SOCKET (aislado por sala de sesión)
export const emitQueue = async (io, sessionId) => {
  const queue = await getOrderedQueue(sessionId);
  const singing = await getSingingList(sessionId);
  
  // Emitimos solo a los clientes conectados a esa sesión específica
  io.to(sessionId.toString()).emit('update_queue', { queue, singing });
};

// 4. NUEVO: Lógica para agregar canción con herencia de localId
export const addSongLogic = async (songData) => {
  const { name, song, deviceId, sessionId } = songData;
  console.log(`----> ListLogic: Procesando para Sesión: ${sessionId}`);

  if (!sessionId) {
    console.error("----> ListLogic Error: No llegó sessionId");
    throw new Error("ID_SESSION_REQUIRED");
  }

  // Buscamos la sesión para obtener el localId automáticamente
  const sessionData = await Session.findById(sessionId);
  if (!sessionData) {
    console.error(`----> ListLogic Error: No existe sesión con ID ${sessionId}`);
    throw new Error("SESSION_NOT_FOUND");
  }

  const now = new Date();
  
  // Verificamos si el usuario ya tiene algo activo en esta sesión
  const userHasActive = await Song.findOne({ 
    status: 'waiting', 
    sessionId: sessionId,
    virtualTimestamp: { $ne: null },
    $or: [{ name }, { deviceId }] 
  });
  console.log(`----> ListLogic: Sesión encontrada. LocalId vinculado: ${sessionData.localId}`);
  const newSong = new Song({
    name,
    song,
    deviceId,
    sessionId,
    localId: sessionData.localId, // Inyectamos el localId de la sesión
    createdAt: now,
    updatedAt: now,
    virtualTimestamp: userHasActive ? null : now 
  });
  const saved = await newSong.save();
  console.log("----> ListLogic: Guardado en MongoDB OK");
  return saved;
};

// 5. Lógica de Justicia: Adelantar o Retrasar

export const adjustPriorityLogic = async (songId, direction) => {
  const song = await Song.findById(songId);
  if (!song) throw new Error("SONG_NOT_FOUND");

  const queue = await getOrderedQueue(song.sessionId);
  // Solo aplicamos la lógica a las canciones que están activas (tienen tiempo)
  const activeQueue = queue.filter(s => s.virtualTimestamp !== null);
  const index = activeQueue.findIndex(s => s._id.toString() === songId);

  // Si está en pausa no se hace nada
  if (index === -1) return song.sessionId;

  // ADELANTAR: Sube un lugar
  if (direction === 'advance' && index > 0) {
    let newTimeMs;
    if (index === 1) {
      // Sube a la posición #1: Restamos 1 segundo al tiempo del primero
      newTimeMs = new Date(activeQueue[0].virtualTimestamp).getTime() - 1000;
    } else {
      // Se inserta matemáticamente en el medio del anterior y el anterior-anterior
      const tPrevPrev = new Date(activeQueue[index - 2].virtualTimestamp).getTime();
      const tPrev = new Date(activeQueue[index - 1].virtualTimestamp).getTime();
      const diff = tPrev - tPrevPrev;
      
      if (diff > 2) {
        newTimeMs = tPrevPrev + Math.floor(diff / 2);
      } else {
        newTimeMs = tPrev - 1000; // Si no hay espacio, fuerza 1 segundo
      }
    }
    song.virtualTimestamp = new Date(newTimeMs);
    song.adjustmentMarker = 'advanced';
    await song.save();
  } 
  
  // RETRASAR: Baja un lugar
  if (direction === 'delay' && index < activeQueue.length - 1) {
    let newTimeMs;
    if (index === activeQueue.length - 2) {
      // Baja a la última posición: Sumamos 1 segundo al tiempo del último
      newTimeMs = new Date(activeQueue[activeQueue.length - 1].virtualTimestamp).getTime() + 1000;
    } else {
      // Se inserta matemáticamente en el medio del siguiente y el subsiguiente
      const tNext = new Date(activeQueue[index + 1].virtualTimestamp).getTime();
      const tNextNext = new Date(activeQueue[index + 2].virtualTimestamp).getTime();
      const diff = tNextNext - tNext;
      
      if (diff > 2) {
        newTimeMs = tNext + Math.floor(diff / 2);
      } else {
        newTimeMs = tNext + 1000; // Si no hay espacio, fuerza 1 segundo
      }
    }
    song.virtualTimestamp = new Date(newTimeMs);
    song.adjustmentMarker = 'delayed';
    await song.save();
  }
  
  return song.sessionId; 
};

// 6. Lógica para marcar como "cantando" y calcular tiempo promedio ponderado
export const markSongAsSingingLogic = async (songId) => {
  const songToSing = await Song.findById(songId);
  if (!songToSing) throw new Error("Canción no encontrada");

  const sessionId = songToSing.sessionId;

  // 1. Finalizar las que estén cantando EN ESA SESIÓN
  await Song.updateMany(
    { status: 'singing', sessionId }, 
    { $set: { status: 'finished' } }
  );

  // 2. Marcar la actual como cantando
  const song = await Song.findByIdAndUpdate(
    songId, 
    { status: 'singing', updatedAt: new Date() },
    { new: true }
  );
  
  // 3. Activar la siguiente del mismo usuario en la misma sesión
  const nextInLine = await Song.findOne({ 
    status: 'waiting', 
    sessionId,
    virtualTimestamp: null,
    $or: [{ name: song.name }, { deviceId: song.deviceId }]
  }).sort({ createdAt: 1 });

  if (nextInLine) {
    nextInLine.virtualTimestamp = new Date();
    await nextInLine.save();
  }

  // 4. Lógica de cálculo de tiempo promedio ponderado
  const session = await Session.findById(sessionId);
  const nowTime = new Date();

  let currentAvg = session.averageTime || 300000;

  if (session.lastSingTimestamp) {
    const timeDiff = nowTime.getTime() - session.lastSingTimestamp.getTime();
    // Tope de 15 minutos (900000 ms) para evitar desajustes por pausas largas del DJ
    const validDiff = Math.min(timeDiff, 900000); 
    currentAvg = (0.8 * currentAvg) + (0.2 * validDiff);
  }

  session.averageTime = currentAvg;
  session.lastSingTimestamp = nowTime;
  await session.save();

  return song;
};

// 7. NUEVO: Borrar todas las canciones de un usuario en una sesión
export const deleteUserSongsLogic = async (deviceId, sessionId) => {
  if (!deviceId || !sessionId) {
    throw new Error("DEVICE_ID_AND_SESSION_ID_REQUIRED");
  }

  return await Song.deleteMany({
    deviceId,
    sessionId,
    status: 'waiting'
  });
};