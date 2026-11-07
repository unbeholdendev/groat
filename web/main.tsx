import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import "./index.css";
import { queryClient } from "./query-client";
import { router } from "./router";

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
if (import.meta.env.PROD) navigator.serviceWorker?.register("/sw.js").catch(() => {});
