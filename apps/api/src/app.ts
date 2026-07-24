import "express-async-errors";
import cors from "cors";
import express from "express";
import { authRouter } from "./modules/auth/auth.routes";
import { subjectsRouter } from "./modules/subjects/subjects.routes";
import { coursesRouter } from "./modules/courses/courses.routes";
import { batchesRouter } from "./modules/batches/batches.routes";
import { studentsRouter } from "./modules/students/students.routes";
import { enrollmentsRouter } from "./modules/enrollments/enrollments.routes";
import { leadsRouter } from "./modules/leads/leads.routes";
import { facultyRouter } from "./modules/faculty/faculty.routes";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes";
import { centersRouter } from "./modules/centers/centers.routes";
import { staffRouter }   from "./modules/staff/staff.routes";
import { feesRouter }     from "./modules/fees/fees.routes";
import { scheduleRouter } from "./modules/schedule/schedule.routes";
import { documentTypesRouter } from "./modules/documents/documentTypes.routes";
import { errorHandler }  from "./middleware/errorHandler";

export const app = express();

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  const start = Date.now();
  console.log(`→ ${req.method} ${req.originalUrl}`);
  res.on("finish", () => {
    console.log(`← ${req.method} ${req.originalUrl} ${res.statusCode} (${Date.now() - start}ms)`);
  });
  next();
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRouter);
app.use("/api/subjects", subjectsRouter);
app.use("/api/courses", coursesRouter);
app.use("/api/batches", batchesRouter);
app.use("/api/students", studentsRouter);
app.use("/api/enrollments", enrollmentsRouter);
app.use("/api/leads", leadsRouter);
app.use("/api/faculty", facultyRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/centers", centersRouter);
app.use("/api/staff",   staffRouter);
app.use("/api/fees",     feesRouter);
app.use("/api/schedule", scheduleRouter);
app.use("/api/document-types", documentTypesRouter);

app.use(errorHandler);
