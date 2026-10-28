import type { RequestHandler } from "express";
import { z } from "zod";
import { createContent, deleteContent, listContent, updateContent, type ContentInput } from "../services/content.service.js";
import type { PublicUser } from "../services/auth.service.js";

const contentSchema = z.object({
  subject: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(180),
  topic: z.string().trim().min(1).max(180),
  summary: z.string().trim().max(500).default(""),
  body: z.string().trim().min(1).max(100_000),
  status: z.enum(["draft", "published"]).default("draft"),
});
const idSchema = z.string().regex(/^[1-9]\d{0,19}$/);
const requestError = (response: Parameters<RequestHandler>[1], status: number, message: string, details?: unknown) => response.status(status).json({ error: { message, ...(details ? { details } : {}) } });

export const getContent: RequestHandler = async (request, response, next) => {
  const query = typeof request.query.q === "string" ? request.query.q.trim().slice(0, 160) : "";
  const status = request.query.status;
  if (status !== undefined && status !== "all" && status !== "draft" && status !== "published") return requestError(response, 400, "Choose a valid content status.");
  try { response.json({ items: await listContent({ query, status: status as "all" | "draft" | "published" | undefined }) }); }
  catch (error) { next(error); }
};

export const postContent: RequestHandler = async (request, response, next) => {
  const parsed = contentSchema.safeParse(request.body);
  if (!parsed.success) return requestError(response, 400, "Please check the content details.", parsed.error.flatten().fieldErrors);
  try {
    const user = response.locals.authUser as PublicUser;
    const item = await createContent(parsed.data as ContentInput, user.id, user.role as "teacher" | "admin");
    if (!item) return requestError(response, 500, "We could not save this content.");
    response.status(201).json({ item });
  } catch (error) { next(error); }
};

export const putContent: RequestHandler = async (request, response, next) => {
  const id = idSchema.safeParse(request.params.id);
  const parsed = contentSchema.safeParse(request.body);
  if (!id.success) return requestError(response, 400, "Choose a valid content item.");
  if (!parsed.success) return requestError(response, 400, "Please check the content details.", parsed.error.flatten().fieldErrors);
  try {
    const item = await updateContent(id.data, parsed.data as ContentInput);
    if (!item) return requestError(response, 404, "This content item no longer exists.");
    response.json({ item });
  } catch (error) { next(error); }
};

export const removeContent: RequestHandler = async (request, response, next) => {
  const id = idSchema.safeParse(request.params.id);
  if (!id.success) return requestError(response, 400, "Choose a valid content item.");
  try {
    if (!await deleteContent(id.data)) return requestError(response, 404, "This content item no longer exists.");
    response.status(204).end();
  } catch (error) { next(error); }
};
