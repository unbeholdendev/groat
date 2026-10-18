import { createContext } from "react";
import type { Unit } from "../../shared/amount";

export const UnitContext = createContext<[Unit, (u: Unit) => void]>(["BTC", () => {}]);
