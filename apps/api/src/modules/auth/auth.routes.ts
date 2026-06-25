import { Router } from "express";
import { loginSchema } from "@institute-os/shared";
import { validateBody } from "../../middleware/validate";
import { login } from "./auth.service";

export const authRouter = Router();

authRouter.post("/login", validateBody(loginSchema), async (req, res) => {
  const result = await login(req.body);
  if (!result) return res.status(401).json({ error: "Invalid credentials" });
  res.json(result);
});
