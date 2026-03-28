import crypto from "node:crypto";
import jwt from "jsonwebtoken";

const HASH_PREFIX = "sha256:";

export function hashPassword(rawPassword: string): string {
  const digest = crypto.createHash("sha256").update(rawPassword).digest("hex");
  return `${HASH_PREFIX}${digest}`;
}

export function verifyPassword(rawPassword: string, passwordHash: string): boolean {
  return hashPassword(rawPassword) === passwordHash;
}

export function signToken(userId: string, secret: string): string {
  return jwt.sign({ sub: userId }, secret, { expiresIn: "7d" });
}

export function verifyToken(token: string, secret: string): string | null {
  try {
    const payload = jwt.verify(token, secret) as { sub?: string };
    return payload.sub ?? null;
  } catch {
    return null;
  }
}
