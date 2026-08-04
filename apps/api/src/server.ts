import "dotenv/config";
import { app } from "./app";
import { env } from "./lib/env";
import { prisma } from "./lib/prisma";
import { backfillAdmissionPayments } from "./modules/fees/fees.service";
import { runNotificationSweeps } from "./modules/notifications/sweep";

app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`);
  backfillAdmissionPayments(prisma)
    .then((n) => { if (n > 0) console.log(`Backfilled fee schedules for ${n} existing student(s)`); })
    .catch((err) => console.error("Fee backfill error:", err));

  setInterval(() => runNotificationSweeps(prisma).catch((err) => console.error("Notification sweep error:", err)), 60_000);
});
