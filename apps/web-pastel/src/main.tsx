import "@fontsource/onest/400.css";
import "@fontsource/onest/500.css";
import "@fontsource/onest/600.css";
import "@fontsource/onest/700.css";
import "@fontsource/onest/800.css";
import { createClient } from "@onyc/sdk";
import { ApiProvider } from "@onyc/sdk/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import "./tokens.css";
import "./app.css";

const client = createClient({ baseUrl: import.meta.env.VITE_API_URL ?? window.location.origin });
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

const root = document.getElementById("root");
if (root === null) throw new Error("#root is missing");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ApiProvider client={client}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ApiProvider>
    </QueryClientProvider>
  </StrictMode>,
);
