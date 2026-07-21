import { NextFunction, Request, Response } from "express";
import { ZodSchema } from "zod";

export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const flat = result.error.flatten();
      const fieldErrors = Object.entries(flat.fieldErrors)
        .map(([field, msgs]) => `${field}: ${(msgs as string[]).join(", ")}`)
        .join("; ");
      const summary = fieldErrors || flat.formErrors.join("; ") || "Validation failed";
      console.error("[validateBody]", summary, JSON.stringify(flat));
      return res.status(400).json({ error: summary });
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return res.status(400).json({ error: result.error.flatten() });
    }
    // Replace raw query so downstream handlers get coerced/defaulted values
    (req as Request & { parsedQuery: unknown }).parsedQuery = result.data;
    next();
  };
}

export function validateUuidParam(paramName = "id") {
  return (req: Request, res: Response, next: NextFunction) => {
    const uuid = req.params[paramName];
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)) {
      return res.status(400).json({ error: `Invalid ${paramName} — must be a UUID` });
    }
    next();
  };
}
