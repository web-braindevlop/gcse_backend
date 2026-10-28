import { Router } from "express";
import { getDatabaseHealth, getServiceHealth } from "../controllers/health.controller.js";

export const healthRouter = Router();

healthRouter.get("/", getServiceHealth);
healthRouter.get("/database", getDatabaseHealth);
