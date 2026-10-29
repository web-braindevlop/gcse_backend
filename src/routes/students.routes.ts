import { Router } from "express";
import { getStudentProfile, getStudents, putStudentProfile } from "../controllers/students.controller.js";
import { requireStaff } from "../middleware/require-staff.js";

export const studentsRouter = Router();
studentsRouter.use(requireStaff);
studentsRouter.get("/", getStudents);
studentsRouter.get("/:id/learning-profile", getStudentProfile);
studentsRouter.put("/:id/learning-profile", putStudentProfile);
