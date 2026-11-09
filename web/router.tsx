import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import type { Draft, Template } from "./lib/schemas";
import { Button } from "./components/button";

export const router = createRouter({
  routeTree,
  defaultErrorComponent: ({ error }) => (
    <div className="py-10">
      <h1 className="text-display font-bold">This didn’t load</h1>
      <p className="mt-2 text-ink2">{error instanceof Error ? error.message : String(error)}</p>
      <Button variant="quiet" className="mt-5" onClick={() => location.reload()}>
        Try again
      </Button>
    </div>
  ),
  parseSearch: (s) => Object.fromEntries(new URLSearchParams(s)),
  stringifySearch: (s) => {
    const q = new URLSearchParams(Object.entries(s).filter(([, v]) => v)).toString();
    return q && `?${q}`;
  },
});
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
  interface HistoryState {
    draft?: Draft;
    template?: Template;
    fromList?: boolean;
  }
}
