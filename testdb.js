import mongoose from 'mongoose';

const uri = "mongodb+srv://sfernand:HI9qYgKpnCtbJfMB@cluster0.l8aajfh.mongodb.net/karaoke_db?retryWrites=true&w=majority";

console.log("⏳ Intentando conectar a MongoDB Atlas...");

mongoose.connect(uri)
  .then(() => {
    console.log("✅ ¡CONECTADO EXITOSAMENTE DESDE TU PC!");
    process.exit(0);
  })
  .catch(err => {
    console.error("❌ ERROR DE CONEXIÓN:");
    console.error(err.message);
    process.exit(1);
  });

