import { createApp } from "./app";

export function startServer() {
  const app = createApp();
  const port = Number(process.env.PORT ?? 3000);

  app.listen(port, () => {
    // Intentionally minimal startup logging.
    console.log(`API listening on port ${port}`);
  });

  return app;
}

if (require.main === module) {
  startServer();
}
