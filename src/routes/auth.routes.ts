import { Router } from "express";
import { currentUser, loginStaff, loginStudent, logout, register } from "../controllers/auth.controller.js";
import { registrationRateLimit, signInRateLimit } from "../middleware/auth-rate-limit.js";

export const authRouter = Router();
authRouter.post("/register", registrationRateLimit, register);
authRouter.post("/login", signInRateLimit, loginStudent);
authRouter.post("/login/student", signInRateLimit, loginStudent);
authRouter.post("/login/staff", signInRateLimit, loginStaff);
authRouter.get("/me", currentUser);
authRouter.post("/logout", logout);
