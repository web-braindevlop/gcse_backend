import type { RequestHandler } from "express";
import { findUserBySessions } from "../services/auth.service.js";

export const requireStudent: RequestHandler = async (request, response, next) => {
  const tokens = (request.headers.cookie ?? "").split(";").map((part) => part.trim()).filter((part) => part.startsWith("educate_cloud_session=")).map((part) => part.slice("educate_cloud_session=".length));
  if (!tokens.length) { response.status(401).json({ error: { message: "Sign in with your student account." } }); return; }
  try {
    const user = await findUserBySessions(tokens);
    if (!user) { response.status(401).json({ error: { message: "Your session has expired. Please sign in again." } }); return; }
    if (user.role !== "student") { response.status(403).json({ error: { message: "This area is for students." } }); return; }
    response.locals.authUser = user;
    next();
  } catch (error) { next(error); }
};
