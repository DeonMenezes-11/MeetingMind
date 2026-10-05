import { Compass } from "lucide-react";
import { lazy, Suspense } from "react";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { ToastProvider } from "./components/overlays";
import { Button, Skeleton } from "./components/ui";
import { ThemeProvider } from "./lib/theme";
import Home from "./pages/Home";

const NewMeeting = lazy(() => import("./pages/NewMeeting"));
const Processing = lazy(() => import("./pages/Processing"));
const Workspace = lazy(() => import("./pages/workspace/Workspace"));
const About = lazy(() => import("./pages/About"));

function PageFallback() {
  return (
    <div className="mx-auto max-w-[1440px] space-y-4 px-6 py-10">
      <Skeleton className="h-8 w-72" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <BrowserRouter>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route element={<AppShell />}>
                <Route index element={<Home />} />
                <Route path="new" element={<NewMeeting />} />
                <Route path="jobs/:jobId" element={<Processing />} />
                <Route path="m/:runId" element={<Workspace />} />
                <Route path="m/:runId/:section" element={<Workspace />} />
                <Route path="about" element={<About />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  );
}

function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-6 py-24 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-surface-2 text-subtle">
        <Compass className="size-7" />
      </span>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 text-sm text-subtle">That link doesn't lead anywhere in MeetingMind.</p>
      <Link to="/" className="mt-6 inline-block">
        <Button variant="primary">Back to meetings</Button>
      </Link>
    </div>
  );
}
