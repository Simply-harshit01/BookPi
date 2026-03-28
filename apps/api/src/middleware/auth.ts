import type { NextFunction, Request, Response } from "express";
import { env } from "../config.js";
import { verifyToken } from "../services/authService.js";

declare module "express-serve-static-core" {
  interface Request {
    userId?: string;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }

  const token = authHeader.slice("Bearer ".length);
  const userId = verifyToken(token, env.JWT_SECRET);
  if (!userId) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  req.userId = userId;
  next();
}
