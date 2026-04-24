import express from 'express';
import crypto from 'crypto';
import User from '../models/User.js';
// Importación crítica de la lógica de negocio
import { 
  loginUserLogic, 
  registerLocalAdminLogic, 
  registerDjLogic, 
  getLocalsListLogic, 
  getDjsByLocalLogic 
} from '../logic/UserLogic.js';

const router = express.Router();

/**
 * AUTH: Inicio de sesión (Root, Admin o DJ)
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    // Esta función ahora sí está definida gracias al import superior
    const user = await loginUserLogic(email, password); 
    res.json(user);
  } catch (error) {
    console.error(`[AUTH ERROR] ${new Date().toISOString()}: ${error.message}`);
    res.status(401).json({ error: "Credenciales incorrectas" });
  }
});

/**
 * MODD GOD: Registro de nuevo administrador y local
 */
router.post('/register-local', async (req, res) => {
  console.log("1. Router: Llamando a la lógica...");
  try {
    const user = await registerLocalAdminLogic(req.body);
    
    // Si llegamos aquí, la lógica terminó sin errores
    console.log("4. Router: Lógica exitosa. User ID:", user?._id);
    console.log("5. Router: Datos del usuario para el JSON:", {
      role: user?.role,
      localId: user?.associatedLocalId
    });

    res.status(201).json({ 
      message: "Local registrado",
      localId: user.associatedLocalId 
    });
  } catch (error) {
    // Si el error ocurre en el Router (punto 4 o 5), lo veremos aquí
    console.error("!!! ERROR EN EL ROUTER !!!");
    console.error("Tipo:", error.name);
    console.error("Mensaje:", error.message);
    
    res.status(400).json({ 
      error: "Error en el proceso de registro", 
      detail: error.message 
    });
  }
});

/**
 * ADMIN: Registro de DJ asociado a un local
 */
router.post('/register-dj', async (req, res) => {
  try {
    await registerDjLogic(req.body);
    res.status(201).json({ message: "DJ registrado con éxito" });
  } catch (error) {
    const status = error.message === "LOCAL_NOT_FOUND" ? 404 : 400;
    res.status(status).json({ error: error.message });
  }
});

/**
 * LISTADOS: Obtener todos los locales (Para SuperAdmin)
 */
router.get('/locals', async (req, res) => {
  try {
    const locals = await getLocalsListLogic();
    res.json(locals);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener locales" });
  }
});

/**
 * LISTADOS: Obtener DJs de un local específico
 */
router.get('/djs/:localId', async (req, res) => {
  try {
    const djs = await getDjsByLocalLogic(req.params.localId);
    res.json(djs);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener DJs" });
  }
});


// Editar Local (Llama a updateLocalLogic que ya teníamos)
router.put('/locals/:id', async (req, res) => {
  try {
    const updated = await updateLocalLogic(req.params.id, req.body);
    res.json(updated);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Editar DJ o Admin (Genérico)
router.put('/:id', async (req, res) => {
  try {
    const updated = await updateUserLogic(req.params.id, req.body);
    res.json(updated);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Eliminar DJ
router.delete('/djs/:id', async (req, res) => {
  try {
    await deleteDjLogic(req.params.id);
    res.json({ message: "DJ eliminado" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});


export default router;


