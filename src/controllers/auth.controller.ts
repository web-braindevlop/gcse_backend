import { randomBytes } from "node:crypto";
import type { RequestHandler } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import {
  createUser,
  createUserSession,
  deleteUserSession,
  findUserByIdentifier,
  findUserBySessions,
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

function hostOnlyCookieOptions() {
  return { httpOnly: true, secure: env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };
}

function clearSessionCookies(response: Parameters<RequestHandler>[1]) {
  // Remove the old API-host-only cookie as well as the shared-domain cookie.
  // Browsers can send both when they share a name and path, which makes the
  // session selected by the API dependent on cookie ordering.
  if (env.COOKIE_DOMAIN) response.clearCookie(SESSION_COOKIE, cookieOptions());
  response.clearCookie(SESSION_COOKIE, hostOnlyCookieOptions());
}

function sessionTokensFromRequest(request: Parameters<RequestHandler>[0]) {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return [];
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${SESSION_COOKIE}=`))
    .map((part) => part.slice(SESSION_COOKIE.length + 1));
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
    response.clearCookie(SESSION_COOKIE, hostOnlyCookieOptions());
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
      response.clearCookie(SESSION_COOKIE, hostOnlyCookieOptions());
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
  const tokens = sessionTokensFromRequest(request);
  if (tokens.length === 0) {
    response.status(401).json({ error: { message: "You are not signed in." } });
    return;
  }
  try {
    const user = await findUserBySessions(tokens);
    if (!user) {
      clearSessionCookies(response);
      response.status(401).json({ error: { message: "Your session has expired. Please sign in again." } });
      return;
    }
    response.status(200).json({ user });
  } catch (error) {
    next(error);
  }
};

export const logout: RequestHandler = async (request, response, next) => {
  const tokens = sessionTokensFromRequest(request);
  try {
    await Promise.all(tokens.map(deleteUserSession));
    clearSessionCookies(response);
    response.status(204).end();
  } catch (error) {
    next(error);
  }
};
