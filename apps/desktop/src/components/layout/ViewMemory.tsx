import { createContext, useContext } from "react";

export type ViewMemory = {
  read: (key: string) => Record<string, number> | undefined;
  write: (key: string, value: Record<string, number>) => void;
};
export const ViewMemoryContext = createContext<ViewMemory | null>(null);
export function useViewMemory() {
  return useContext(ViewMemoryContext);
}
