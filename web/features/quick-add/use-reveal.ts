import { useEffect, useRef } from "react";

export function useReveal(active: boolean, ready: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest" });
  }, [active, ready]);
  return ref;
}
