import { rateLimit } from "express-rate-limit";

export const signInRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_request, response) => {
    response.status(429).json({ error: { message: "Too many sign-in attempts. Please wait 15 minutes and try again." } });
  },
});

export const registrationRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_request, response) => {
    response.status(429).json({ error: { message: "Too many accounts were created from this connection. Please try again later." } });
  },
});
