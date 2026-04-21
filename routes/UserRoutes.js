import express from 'express';
import User from '../models/User.js';
import crypto from 'crypto';

const router = express.Router();

router.post('/register-local', async (req, res) => {
  try {
    const { name, email, password, localName, address } = req.body;
    const localId = crypto.randomBytes(4).toString('hex').toUpperCase();
    const newAdmin = new User({
      name, email, password, role: 'admin',
      localInfo: { localId, name: localName, address }
    });
    await newAdmin.save();
    res.status(201).json({ localId });
  } catch (error) {
    res.status(400).json({ error: "Email duplicado" });
  }
});

router.post('/register-dj', async (req, res) => {
  try {
    const { name, email, password, localId } = req.body;
    const newDj = new User({ name, email, password, role: 'dj', associatedLocalId: localId });
    await newDj.save();
    res.status(201).json({ message: "DJ OK" });
  } catch (error) {
    res.status(400).json({ error: "Email duplicado" });
  }
});

export default router;