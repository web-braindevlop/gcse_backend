import type { RequestHandler } from "express";
import { findUserBySessions } from "../services/auth.service.js";

const SESSION_COOKIE = "educate_cloud_session";

function sessionTokens(cookieHeader?: string) {
  return (cookieHeader ?? "")
    .split(";")
    .map((item) => item.trim())
    .filter((item) => item.startsWith(`${SESSION_COOKIE}=`))
    .map((item) => item.slice(SESSION_COOKIE.length + 1));
}

export const requireStaff: RequestHandler = async (request, response, next) => {
  const tokens = sessionTokens(request.headers.cookie);
  if (tokens.length === 0) { response.status(401).json({ error: { message: "Sign in with a teacher or administrator account." } }); return; }
  try {
    const user = await findUserBySessions(tokens);
    if (!user) { response.status(401).json({ error: { message: "Your session has expired. Please sign in again." } }); return; }
    if (user.role !== "teacher" && user.role !== "admin") { response.status(403).json({ error: { message: "This area is for teachers and administrators." } }); return; }
    response.locals.authUser = user;
    next();
  } catch (error) { next(error); }
};
