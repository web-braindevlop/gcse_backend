import type { RequestHandler } from "express";
import { z } from "zod";
import { getStudentLearningProfile, listStudents, saveStudentLearningProfile } from "../services/students.service.js";

const studentIdSchema = z.string().regex(/^\d{1,20}$/);
const learningProfileSchema = z.object({
  level: z.enum(["gcse", "igcse_o_level", "a_level"]),
  subject: z.string().trim().min(1).max(80),
  examBoard: z.string().trim().min(1).max(80),
  schoolYear: z.string().trim().min(1).max(20),
  targetGrade: z.string().trim().min(1).max(10),
  tier: z.enum(["foundation", "higher", "not_sure"]).nullable(),
});

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

export const getStudentProfile: RequestHandler = async (request, response, next) => {
  const studentId = studentIdSchema.safeParse(request.params.id);
  if (!studentId.success) {
    response.status(400).json({ error: { message: "Please select a valid student account." } });
    return;
  }
  try {
    const profile = await getStudentLearningProfile(studentId.data);
    if (profile === undefined) {
      response.status(404).json({ error: { message: "Student account not found." } });
      return;
    }
    response.json({ profile });
  } catch (error) { next(error); }
};

export const putStudentProfile: RequestHandler = async (request, response, next) => {
  const studentId = studentIdSchema.safeParse(request.params.id);
  const input = learningProfileSchema.safeParse(request.body);
  if (!studentId.success || !input.success) {
    response.status(400).json({ error: { message: "Please check the student learning profile details." } });
    return;
  }
  try {
    const actor = response.locals.authUser as { id: string; role: "teacher" | "admin" };
    const profile = await saveStudentLearningProfile(studentId.data, input.data, actor);
    if (!profile) {
      response.status(404).json({ error: { message: "Student account not found." } });
      return;
    }
    response.json({ profile });
  } catch (error) { next(error); }
};
