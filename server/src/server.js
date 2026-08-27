import 'dotenv/config';
import app from './app.js';
import { connectDatabase } from './config/database.js';

const PORT = process.env.PORT || 5000;

async function start() {
  await connectDatabase();

  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
  });
}

start();
