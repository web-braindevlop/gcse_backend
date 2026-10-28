import { randomBytes } from "node:crypto";
import type { RequestHandler } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import {
  createUser,
  createUserSession,
  deleteUserSession,
  findUserByIdentifier,
  findUserBySession,
  hashPassword,
  verifyPassword,
  type UserRole,
} from "../services/auth.service.js";

const SESSION_COOKIE = "educate_cloud_session";
const identifierSchema = z.string().trim().min(1).max(254);
const loginSchema = z.object({ identifier: identifierSchema, password: z.string().min(1).max(128) });
const registerSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
});

function cookieOptions() {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

function sessionTokenFromRequest(request: Parameters<RequestHandler>[0]) {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return null;
  const pair = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  return pair ? pair.slice(SESSION_COOKIE.length + 1) : null;
}

function invalidInput(response: Parameters<RequestHandler>[1], message: string, details: unknown) {
  response.status(400).json({ error: { message, details } });
}

export const register: RequestHandler = async (request, response, next) => {
  const parsed = registerSchema.safeParse(request.body);
  if (!parsed.success) return invalidInput(response, "Please check the details you entered.", parsed.error.flatten().fieldErrors);

  try {
    const values = parsed.data;
    const username = `student_${randomBytes(8).toString("hex")}`;
    const email = values.email.toLowerCase();
    const passwordHash = await hashPassword(values.password);
    const userId = await createUser({ username, email, displayName: values.displayName, passwordHash, role: "student" });
    const session = await createUserSession(userId, "student");
    response.cookie(SESSION_COOKIE, session.token, { ...cookieOptions(), maxAge: session.maxAge });
    response.status(201).json({ user: { id: userId, username, email, displayName: values.displayName, role: "student" } });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ER_DUP_ENTRY") {
      response.status(409).json({ error: { message: "That email is already in use." } });
      return;
    }
    next(error);
  }
};

function createLoginHandler(audience: "student" | "staff"): RequestHandler {
  return async (request, response, next) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) return invalidInput(response, "Enter your email or username and password.", parsed.error.flatten().fieldErrors);

    try {
      const user = await findUserByIdentifier(parsed.data.identifier, audience);
      const passwordMatches = user?.password_hash ? await verifyPassword(parsed.data.password, user.password_hash) : false;
      const roleMatches = user ? audience === "student" ? user.role === "student" : user.role === "teacher" || user.role === "admin" : false;
      if (!user || !passwordMatches || !roleMatches) {
        response.status(401).json({ error: { message: "Email, username or password is incorrect for this sign-in." } });
        return;
      }
      const session = await createUserSession(user.id, user.role);
      response.cookie(SESSION_COOKIE, session.token, { ...cookieOptions(), maxAge: session.maxAge });
      response.status(200).json({
        user: { id: user.id, username: user.username, email: user.email, displayName: user.display_name, role: user.role },
      });
    } catch (error) {
      next(error);
    }
  };
}

export const loginStudent = createLoginHandler("student");
export const loginStaff = createLoginHandler("staff");

export const currentUser: RequestHandler = async (request, response, next) => {
  const token = sessionTokenFromRequest(request);
  if (!token) {
    response.status(401).json({ error: { message: "You are not signed in." } });
    return;
  }
  try {
    const user = await findUserBySession(token);
    if (!user) {
      response.clearCookie(SESSION_COOKIE, cookieOptions());
      response.status(401).json({ error: { message: "Your session has expired. Please sign in again." } });
      return;
    }
    response.status(200).json({ user });
  } catch (error) {
    next(error);
  }
};

export const logout: RequestHandler = async (request, response, next) => {
  const token = sessionTokenFromRequest(request);
  try {
    if (token) await deleteUserSession(token);
    response.clearCookie(SESSION_COOKIE, cookieOptions());
    response.status(204).end();
  } catch (error) {
    next(error);
  }
};
