import { NextFunction, Request, Response } from "express";

// Minimal in-memory sliding-window limiter, keyed by IP. Fine for the
// single-instance deployment in infra/docker-compose.prod.yml — revisit with
// a Valkey-backed limiter if the API ever runs multiple replicas.
export function rateLimit({ windowMs, max }: { windowMs: number; max: number }) {
  const hits = new Map<string, number[]>();

  return (req: Request, res: Response, next: NextFunction) => {
    // Rate limiting is a production concern, not something the test suite
    // should have to work around — every supertest request shares one IP,
    // so a real limit would trip on the 6th test in a file, not the 6th
    // real user.
    if (process.env.NODE_ENV === "test") return next();

    const key = req.ip ?? "unknown";
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      return res.status(429).json({ error: "Too many requests — please try again later." });
    }
    recent.push(now);
    hits.set(key, recent);
    next();
  };
}
