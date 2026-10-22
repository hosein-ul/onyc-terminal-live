import { createContext, useContext, type ReactNode } from "react";

const EmbeddedContext = createContext(false);

/** Pages that live inside a combined page draw their header as a section heading, not as the page title. */
export function Embedded({ children }: { children: ReactNode }) {
  return <EmbeddedContext.Provider value={true}>{children}</EmbeddedContext.Provider>;
}

export const useEmbedded = (): boolean => useContext(EmbeddedContext);
