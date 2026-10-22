import "@fontsource/figtree/400.css";
import "@fontsource/figtree/500.css";
import "@fontsource/figtree/600.css";
import "@fontsource/figtree/700.css";
import { createClient } from "@onyc/sdk";
import { ApiProvider } from "@onyc/sdk/react";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import "./tokens.css";
import "./app.css";

const client = createClient({ baseUrl: import.meta.env.VITE_API_URL ?? window.location.origin });
const WEEK = 7 * 24 * 3_600_000;
// Answers are kept for a week and saved in the browser, so when the API is down the last data stays on screen.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      retryDelay: (n) => Math.min(30_000, 1_000 * 2 ** n),
      refetchOnWindowFocus: false,
      gcTime: WEEK,
    },
  },
});
const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: "onyc-cache",
  throttleTime: 2_000,
  // A full or blocked store just means nothing is saved this time.
  retry: () => undefined,
});

const root = document.getElementById("root");
if (root === null) throw new Error("#root is missing");

createRoot(root).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: WEEK,
        buster: "1",
        dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === "success" },
      }}
    >
      <ApiProvider client={client}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ApiProvider>
    </PersistQueryClientProvider>
  </StrictMode>,
);
