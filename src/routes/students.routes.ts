import { Router } from "express";
import { getStudents } from "../controllers/students.controller.js";
import { requireStaff } from "../middleware/require-staff.js";

export const studentsRouter = Router();
studentsRouter.use(requireStaff);
studentsRouter.get("/", getStudents);
