import type { RequestHandler } from "express";
import { findUserBySession } from "../services/auth.service.js";

const SESSION_COOKIE = "educate_cloud_session";

function sessionToken(cookieHeader?: string) {
  const pair = cookieHeader?.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${SESSION_COOKIE}=`));
  return pair ? pair.slice(SESSION_COOKIE.length + 1) : null;
}

export const requireStaff: RequestHandler = async (request, response, next) => {
  const token = sessionToken(request.headers.cookie);
  if (!token) { response.status(401).json({ error: { message: "Sign in with a teacher or administrator account." } }); return; }
  try {
    const user = await findUserBySession(token);
    if (!user) { response.status(401).json({ error: { message: "Your session has expired. Please sign in again." } }); return; }
    if (user.role !== "teacher" && user.role !== "admin") { response.status(403).json({ error: { message: "This area is for teachers and administrators." } }); return; }
    response.locals.authUser = user;
    next();
  } catch (error) { next(error); }
};
