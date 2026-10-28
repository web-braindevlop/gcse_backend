import type { ErrorRequestHandler } from "express";

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  const statusCode =
    typeof error === "object" && error !== null && "status" in error &&
    typeof error.status === "number" && error.status >= 400 && error.status <= 599
      ? error.status
      : 500;

  if (statusCode >= 500) {
    console.error(error);
  }

  response.status(statusCode).json({
    error: {
      message: statusCode >= 500 ? "An unexpected server error occurred." : error.message,
    },
  });
};
