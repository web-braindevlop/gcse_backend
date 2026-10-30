import { Router } from "express";
import { getStudentProfile, getStudents, putStudentProfile, readProfileOptions, updateProfileOptions, readOwnStudentProfile, updateOwnStudentProfile } from "../controllers/students.controller.js";
import { requireStaff } from "../middleware/require-staff.js";
import { requireStudent } from "../middleware/require-student.js";

export const studentsRouter = Router();
studentsRouter.get("/profile-options", requireStudent, readProfileOptions);
studentsRouter.put("/profile-options", requireStaff, updateProfileOptions);
studentsRouter.get("/my-profile", requireStudent, readOwnStudentProfile);
studentsRouter.put("/my-profile", requireStudent, updateOwnStudentProfile);
studentsRouter.get("/", requireStaff, getStudents);
studentsRouter.get("/:id/learning-profile", requireStaff, getStudentProfile);
studentsRouter.put("/:id/learning-profile", requireStaff, putStudentProfile);
