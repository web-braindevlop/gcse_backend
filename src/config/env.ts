import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  CORS_ORIGIN: z.string().url().optional(),
  MYSQL_HOST: z.string().min(1).optional(),
  MYSQL_PORT: z.coerce.number().int().min(1).max(65_535).default(3306),
  MYSQL_USER: z.string().min(1).optional(),
  MYSQL_PASSWORD: z.string().optional(),
  MYSQL_DATABASE: z.string().min(1).optional(),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error("Invalid environment configuration:", result.error.flatten().fieldErrors);
  process.exit(1);
}

if (result.data.NODE_ENV === "production") {
  const requiredProductionVariables = [
    "CORS_ORIGIN",
    "MYSQL_HOST",
    "MYSQL_USER",
    "MYSQL_PASSWORD",
    "MYSQL_DATABASE",
  ];
  const missingVariables = requiredProductionVariables.filter((name) => !process.env[name]?.trim());

  if (missingVariables.length > 0) {
    console.error(`Missing required production environment variables: ${missingVariables.join(", ")}`);
    process.exit(1);
  }
}

export const env = {
  ...result.data,
  CORS_ORIGIN: result.data.CORS_ORIGIN ?? "http://localhost:3000",
  MYSQL_HOST: result.data.MYSQL_HOST ?? "127.0.0.1",
  MYSQL_USER: result.data.MYSQL_USER ?? "root",
  MYSQL_PASSWORD: result.data.MYSQL_PASSWORD ?? "",
  MYSQL_DATABASE: result.data.MYSQL_DATABASE ?? "educ",
};
