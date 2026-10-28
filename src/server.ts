import { app } from "./app.js";
import { database } from "./config/database.js";
import { env } from "./config/env.js";

const server = app.listen(env.PORT, () => {
  console.info(`Educate Cloud API listening on http://localhost:${env.PORT}`);
});

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info(`${signal} received; closing server and database pool.`);

  const forceExit = setTimeout(() => {
    console.error("Graceful shutdown timed out.");
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  server.close(async (error) => {
    try {
      await database.end();
      if (error) throw error;
      process.exitCode = 0;
    } catch (shutdownError) {
      console.error("Error during shutdown:", shutdownError);
      process.exitCode = 1;
    } finally {
      clearTimeout(forceExit);
    }
  });
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
