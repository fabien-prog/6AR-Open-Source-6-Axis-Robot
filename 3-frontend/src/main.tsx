import React from "react";
import "./index.css";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { SocketProvider } from "@/contexts/SocketContext"
import { ThemeProvider } from "./components/theme-provider";
import { Toaster } from "./components/ui/sonner";
import { RobotDataProviders } from "./contexts/robot";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 250,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <SocketProvider>
          <RobotDataProviders>
            <App />
            <Toaster richColors closeButton />
          </RobotDataProviders>
        </SocketProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
