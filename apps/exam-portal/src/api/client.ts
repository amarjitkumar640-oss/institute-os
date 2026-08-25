import axios from "axios";

// Public, read-only routes only — no auth token handling needed (unlike
// apps/web's client.ts), since /api/gov-exams/* is unauthenticated by design.
export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:4000",
  headers: { "Content-Type": "application/json" },
});
