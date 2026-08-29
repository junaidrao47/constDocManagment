import { createApp } from "./app";
import { initializeDatabase } from "./config/database";
import { initializeRedis } from "./config/redis";
import { env } from "./config/env";

export async function startServer() {
  await initializeDatabase();
  await initializeRedis();

  const app = createApp();
  const port = env.port;

  app.listen(port, () => {
    // Intentionally minimal startup logging.
    console.log(`API listening on port ${port}`);
  });

  return app;
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
