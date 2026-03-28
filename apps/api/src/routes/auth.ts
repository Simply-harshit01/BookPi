import { Router } from "express";
import { z } from "zod";
import { env } from "../config.js";
import { getRepository } from "../db/dataSource.js";
import { hashPassword, signToken, verifyPassword } from "../services/authService.js";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const oauthSchema = z.object({
  provider: z.enum(["google", "github"]),
  email: z.string().email()
});

export const authRouter = Router();
const repository = getRepository();

authRouter.post("/signup", async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    return;
  }

  try {
    const user = await repository.createUser(parsed.data.email, hashPassword(parsed.data.password));
    const token = signToken(user.id, env.JWT_SECRET);
    res.status(201).json({ token, user: { id: user.id, email: user.email } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to sign up";
    const duplicate = message.toLowerCase().includes("duplicate") || message.toLowerCase().includes("unique");
    res.status(duplicate ? 409 : 500).json({ error: duplicate ? "User already exists" : message });
  }
});

authRouter.post("/login", async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    return;
  }

  const user = await repository.getUserByEmail(parsed.data.email);
  if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = signToken(user.id, env.JWT_SECRET);
  res.json({ token, user: { id: user.id, email: user.email } });
});

authRouter.post("/oauth/callback", async (req, res) => {
  const parsed = oauthSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    return;
  }

  let user = await repository.getUserByEmail(parsed.data.email);
  if (!user) {
    user = await repository.createUser(parsed.data.email, hashPassword(`${parsed.data.provider}:${parsed.data.email}`));
  }

  const token = signToken(user.id, env.JWT_SECRET);
  res.json({ token, user: { id: user.id, email: user.email, provider: parsed.data.provider } });
});
