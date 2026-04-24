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
  const index = queue.findIndex(s => s._id.toString() === songId);

  // ADELANTAR: Sube un lugar en la lista
  if (direction === 'advance' && index > 0) {
    const targetSong = await Song.findById(queue[index - 1]._id);
    const tempTime = song.virtualTimestamp;
    
    song.virtualTimestamp = targetSong.virtualTimestamp;
    song.adjustmentMarker = 'advanced'; //
    
    targetSong.virtualTimestamp = tempTime;
    
    await song.save();
    await targetSong.save();
  } 
  
  // RETRASAR: Baja un lugar en la lista
  if (direction === 'delay' && index < queue.length - 1) {
    const targetSong = await Song.findById(queue[index + 1]._id);
    const tempTime = song.virtualTimestamp;
    
    song.virtualTimestamp = targetSong.virtualTimestamp;
    song.adjustmentMarker = 'delayed'; //
    
    targetSong.virtualTimestamp = tempTime;
    
    await song.save();
    await targetSong.save();
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