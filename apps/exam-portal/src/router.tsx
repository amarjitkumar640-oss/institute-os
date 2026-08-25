import { createBrowserRouter } from "react-router-dom";
import { PortalLayout } from "@/layouts/PortalLayout";
import { HomePage } from "@/pages/HomePage";
import { JobsPage } from "@/pages/JobsPage";
import { JobDetailPage } from "@/pages/JobDetailPage";
import { CurrentAffairsPage } from "@/pages/CurrentAffairsPage";
import { CurrentAffairDetailPage } from "@/pages/CurrentAffairDetailPage";
import { CalendarPage } from "@/pages/CalendarPage";
import { EligibilityCheckerPage } from "@/pages/EligibilityCheckerPage";

export const router = createBrowserRouter(
  [
    {
      element: <PortalLayout />,
      children: [
        { path: "/", element: <HomePage /> },
        { path: "/jobs", element: <JobsPage /> },
        { path: "/jobs/:slug", element: <JobDetailPage /> },
        { path: "/current-affairs", element: <CurrentAffairsPage /> },
        { path: "/current-affairs/:slug", element: <CurrentAffairDetailPage /> },
        { path: "/calendar", element: <CalendarPage /> },
        { path: "/eligibility-checker", element: <EligibilityCheckerPage /> },
      ],
    },
  ],
  {
    // Separate from Vite's `base` (which only affects asset <script>/<link>
    // URLs) — react-router matches routes against the full pathname, so it
    // needs to be told explicitly that the app is mounted under /exams too,
    // or every route (including "/") 404s once served from that prefix.
    // import.meta.env.BASE_URL mirrors vite.config.ts's `base` automatically.
    basename: import.meta.env.BASE_URL,
  },
);
