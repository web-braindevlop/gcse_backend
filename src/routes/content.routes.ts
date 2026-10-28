import { Router } from "express";
import { getContent, postContent, putContent, removeContent } from "../controllers/content.controller.js";
import { requireStaff } from "../middleware/require-staff.js";

export const contentRouter = Router();
contentRouter.use(requireStaff);
contentRouter.get("/", getContent);
contentRouter.post("/", postContent);
contentRouter.put("/:id", putContent);
contentRouter.delete("/:id", removeContent);
