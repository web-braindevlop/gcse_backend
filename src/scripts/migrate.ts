import { database } from "../config/database.js";
import { ensureAuthSchema } from "../services/auth.service.js";
import { ensureContentSchema } from "../services/content.service.js";

try {
  await ensureAuthSchema();
  await ensureContentSchema();
  console.info("Educate Cloud database schema is ready.");
} catch (error) {
  console.error("Database migration failed.", error);
  process.exitCode = 1;
} finally {
  await database.end();
}
