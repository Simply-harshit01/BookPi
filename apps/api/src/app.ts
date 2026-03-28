import cors from "cors";
import express from "express";
import { authRouter } from "./routes/auth.js";
import { meRouter } from "./routes/me.js";
import { recommendationsRouter } from "./routes/recommendations.js";
import { booksRouter } from "./routes/books.js";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "devbookpi-api" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/me", meRouter);
  app.use("/api/recommendations", recommendationsRouter);
  app.use("/api/books", booksRouter);

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(500).json({ error: message });
  });

  return app;
}
