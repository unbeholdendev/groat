import { type RefObject, useEffect, useState } from "react";
import { Icon, paths } from "../../components/icon";

export function FloatingAdd({ input }: { input: RefObject<HTMLInputElement | null> }) {
  const [away, setAway] = useState(false);
  useEffect(() => {
    const field = input.current;
    if (!field) return;
    const observer = new IntersectionObserver(([entry]) => setAway(!entry.isIntersecting), {
      root: field.closest("main"),
    });
    observer.observe(field);
    return () => observer.disconnect();
  }, [input]);
  if (!away) return null;
  return (
    <button
      type="button"
      onClick={() => {
        input.current?.focus({ preventScroll: true });
        input.current?.scrollIntoView({ block: "center" });
      }}
      className="press fixed right-5 bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-20 flex min-h-11 items-center gap-2 rounded-chip bg-accent px-4 text-sm font-semibold text-on-accent lg:hidden"
    >
      <Icon d={paths.plus} className="size-4" />
      Add expense
    </button>
  );
}
