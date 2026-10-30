import type { RequestHandler } from "express";
import { z } from "zod";
import { getProfileOptions, getStudentLearningProfile, listStudents, saveProfileOptions, saveStudentLearningProfile } from "../services/students.service.js";

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

const optionsSchema=z.object({levels:z.array(z.string().min(1).max(30)).min(1).max(10),subjects:z.array(z.string().trim().min(1).max(80)).min(1).max(100),examBoards:z.array(z.string().trim().min(1).max(80)).min(1).max(30),schoolYears:z.array(z.string().trim().min(1).max(20)).min(1).max(30),targetGrades:z.array(z.string().trim().min(1).max(10)).min(1).max(20)});
export const readProfileOptions: RequestHandler=async(_req,res,next)=>{try{res.json({options:await getProfileOptions()});}catch(e){next(e);}};
export const updateProfileOptions: RequestHandler=async(req,res,next)=>{const parsed=optionsSchema.safeParse(req.body);if(!parsed.success){res.status(400).json({error:{message:"Please provide at least one valid option in each list."}});return;}try{const actor=res.locals.authUser as {id:string};res.json({options:await saveProfileOptions(parsed.data,actor.id)});}catch(e){next(e);}};
export const readOwnStudentProfile: RequestHandler=async(_req,res,next)=>{try{const actor=res.locals.authUser as {id:string};const profile=await getStudentLearningProfile(actor.id);res.json({profile:profile??null});}catch(e){next(e);}};
export const updateOwnStudentProfile: RequestHandler=async(req,res,next)=>{const input=learningProfileSchema.safeParse(req.body);if(!input.success){res.status(400).json({error:{message:"Please check your learning profile details."}});return;}try{const actor=res.locals.authUser as {id:string;role:"student"};const profile=await saveStudentLearningProfile(actor.id,input.data,actor);res.json({profile});}catch(e){next(e);}};
