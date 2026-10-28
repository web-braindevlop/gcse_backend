import type { RequestHandler } from "express";
import { database } from "../config/database.js";

export const getServiceHealth: RequestHandler = (_request, response) => {
  response.status(200).json({ status: "ok", service: "educate-cloud-api" });
};

export const getDatabaseHealth: RequestHandler = async (_request, response, next) => {
  try {
    await database.query("SELECT 1");
    response.status(200).json({ status: "ok", database: "connected" });
  } catch (error) {
    next(error);
  }
};
