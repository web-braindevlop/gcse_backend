import type { RequestHandler } from "express";
import { z } from "zod";
import { listStudents } from "../services/students.service.js";

const querySchema = z.object({
  q: z.string().trim().max(120).default(""),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
});

export const getStudents: RequestHandler = async (request, response, next) => {
  const parsed = querySchema.safeParse(request.query);
  if (!parsed.success) {
    response.status(400).json({ error: { message: "Please check the student search and page number." } });
    return;
  }
  try {
    response.json({ ...(await listStudents({ query: parsed.data.q, page: parsed.data.page, pageSize: 25 })) });
  } catch (error) { next(error); }
};
