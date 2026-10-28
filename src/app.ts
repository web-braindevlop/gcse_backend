import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { healthRouter } from "./routes/health.routes.js";
import { authRouter } from "./routes/auth.routes.js";
import { contentRouter } from "./routes/content.routes.js";
import { studentsRouter } from "./routes/students.routes.js";

export const app = express();

// Hostinger proxies requests to the app and supplies X-Forwarded-For.
// Trust only the single proxy hop so express-rate-limit can identify client IPs.
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: "1mb" }));

app.get("/", (_request, response) => {
  response.status(200).json({ name: "Educate Cloud API", status: "ok" });
});
app.use("/api/health", healthRouter);
app.use("/api/auth", (_request, response, next) => {
  response.setHeader("Cache-Control", "no-store");
  next();
});
app.use("/api/auth", authRouter);
app.use("/api/content", (_request, response, next) => {
  response.setHeader("Cache-Control", "no-store");
  next();
});
app.use("/api/content", contentRouter);
app.use("/api/students", (_request, response, next) => {
  response.setHeader("Cache-Control", "no-store");
  next();
});
app.use("/api/students", studentsRouter);

app.use(notFoundHandler);
app.use(errorHandler);
