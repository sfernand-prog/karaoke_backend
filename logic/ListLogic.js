import Song from '../models/Song.js';

export const getOrderedQueue = async () => {
  return await Song.aggregate([
    { $match: { status: 'waiting' } },
    {
      $addFields: {
        isPaused: { $cond: { if: { $eq: ["$virtualTimestamp", null] }, then: 1, else: 0 } }
      }
    },
    { $sort: { isPaused: 1, virtualTimestamp: 1, createdAt: 1 } }
  ]);
};

export const getSingingList = async () => {
  return await Song.find({ status: 'singing' }).sort({ updatedAt: -1 });
};

export const emitQueue = async (io) => {
  const queue = await getOrderedQueue();
  const singing = await getSingingList();
  io.emit('update_queue', { queue, singing });
};