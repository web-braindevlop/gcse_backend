import type { RequestHandler } from "express";
import { findUserBySessions } from "../services/auth.service.js";

export const requireProfileUser: RequestHandler = async (request, response, next) => {
  const tokens=(request.headers.cookie??"").split(";").map(p=>p.trim()).filter(p=>p.startsWith("educate_cloud_session=")).map(p=>p.slice("educate_cloud_session=".length));
  if(!tokens.length){response.status(401).json({error:{message:"Please sign in to continue."}});return;}
  try{const user=await findUserBySessions(tokens);if(!user){response.status(401).json({error:{message:"Your session has expired. Please sign in again."}});return;}response.locals.authUser=user;next();}catch(error){next(error);}
};
