import { Navigate, RouterProvider, createHashRouter } from "react-router";

import { AppThemeProvider } from "@/app/AppThemeProvider";
import { AppShell } from "@/app/AppShell";
import { ActivePullRequestRouteLayout } from "@/app/routes/ActivePullRequestRouteLayout";
import { ChangesRouteLayout } from "@/app/routes/ChangesRouteLayout";
import { HistoryRouteLayout } from "@/app/routes/HistoryRouteLayout";
import { RepoRequiredLayout } from "@/app/routes/RepoRequiredLayout";
import { Toaster } from "@/components/ui/sonner";
import { PullRequestChecks } from "@/features/pull-requests/screens/PullRequestChecks";
import { PullRequestFiles } from "@/features/pull-requests/screens/PullRequestFiles";
import { PullRequestOverview } from "@/features/pull-requests/screens/PullRequestOverview";
import { PullRequestPreviewLayout } from "@/features/pull-requests/screens/PullRequestPreviewLayout";
import { PullRequestReviewChecksScreen } from "@/features/pull-requests/screens/PullRequestReviewChecksScreen";
import { PullRequestReviewFilesScreen } from "@/features/pull-requests/screens/PullRequestReviewFilesScreen";
import { PullRequestsScreen } from "@/features/pull-requests/screens/PullRequestsScreen";
import { SettingsScreen } from "@/features/settings/screens/SettingsScreen";
import { ChangesFilesScreen } from "@/features/source-control/screens/ChangesFilesScreen";
import { ChangesScreen } from "@/features/source-control/screens/ChangesScreen";
import { HistoryScreen } from "@/features/source-control/screens/HistoryScreen";
import { ReviewScreen } from "@/features/source-control/screens/ReviewScreen";

const router = createHashRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      {
        index: true,
        element: <Navigate to="/changes" replace />,
      },
      {
        path: "settings",
        element: <SettingsScreen />,
      },
      {
        element: <RepoRequiredLayout />,
        children: [
          {
            path: "changes",
            element: <ChangesRouteLayout />,
            children: [
              {
                index: true,
                element: <ChangesScreen />,
              },
              {
                path: "files",
                element: <ChangesFilesScreen />,
              },
              {
                path: "pull-request",
                element: <ActivePullRequestRouteLayout />,
                children: [
                  {
                    index: true,
                    element: <Navigate to="files" replace />,
                  },
                  {
                    path: "files",
                    element: <PullRequestReviewFilesScreen />,
                  },

                  {
                    path: "checks",
                    element: <PullRequestReviewChecksScreen />,
                  },
                ],
              },
            ],
          },
          {
            path: "history",
            element: <HistoryRouteLayout />,
            children: [
              {
                index: true,
                element: <HistoryScreen />,
              },
            ],
          },
          {
            path: "pull-requests",
            element: <PullRequestsScreen />,
          },
          {
            path: "pull-requests/:providerId/:owner/:repo/:pullRequestNumber",
            element: <PullRequestPreviewLayout />,
            children: [
              {
                index: true,
                element: <Navigate to="overview" replace />,
              },
              {
                path: "overview",
                element: <PullRequestOverview />,
              },

              {
                path: "files",
                element: <PullRequestFiles />,
              },
              {
                path: "checks",
                element: <PullRequestChecks />,
              },
            ],
          },
          {
            path: "review",
            element: <ReviewScreen />,
          },
        ],
      },
      {
        path: "*",
        element: <Navigate to="/changes" replace />,
      },
    ],
  },
]);

function App() {
  return (
    <AppThemeProvider>
      <RouterProvider router={router} />
      <Toaster richColors />
    </AppThemeProvider>
  );
}

export default App;
