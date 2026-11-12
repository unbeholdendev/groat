import type { ReactNode } from "react";
import { Button } from "../../components/button";

export const Gate = ({ children }: { children: ReactNode }) => (
  <main className="mx-auto max-w-md px-5 pb-10 lg:pt-12">{children}</main>
);

export const LoadError = ({ error, onRetry }: { error: Error; onRetry: () => void }) => (
  <main className="mx-auto max-w-md px-5 pt-12">
    <h1 className="text-display font-bold">Can’t load Groat</h1>
    <p className="mt-2 text-ink2">{error.message}</p>
    <Button variant="quiet" className="mt-5" onClick={onRetry}>
      Try again
    </Button>
  </main>
);
