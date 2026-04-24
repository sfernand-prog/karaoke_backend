import express from 'express';
import { 
  createSessionLogic, 
  getSessionsByLocalLogic, 
  activateSessionLogic, 
  archiveSessionLogic 
} from '../logic/SessionLogic.js';
import { adjustPriorityLogic } from '../logic/ListLogic.js';

const router = express.Router();

router.get('/:localId', async (req, res) => {
  const sessions = await getSessionsByLocalLogic(req.params.localId);
  res.json(sessions);
});

router.post('/', async (req, res) => {
  try {
    const session = await createSessionLogic(req.body);
    res.status(201).json(session);
  } catch (error) {
    res.status(400).json({ error: "Nombre de sesión duplicado" });
  }
});

router.put('/activate/:id', async (req, res) => {
  const session = await activateSessionLogic(req.params.id);
  res.json(session);
});

router.put('/archive/:id', async (req, res) => {
  const session = await archiveSessionLogic(req.params.id);
  res.json(session);
});

// Ruta para la "justicia" en la fila
router.post('/adjust-priority', async (req, res) => {
  const { songId, direction } = req.body;
  await adjustPriorityLogic(songId, direction);
  res.json({ message: "Prioridad ajustada" });
});

export default router;