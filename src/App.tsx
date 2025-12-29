import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Jails from "./pages/Jails";
import JailEditor from "./pages/JailEditor";
import CreateFilter from "./pages/CreateFilter";
import LiveLog from "./pages/LiveLog";
import Servers from "./pages/Servers";
import ServerDetail from "./pages/ServerDetail";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import { ProtectedRoute } from "./components/ProtectedRoute";

const queryClient = new QueryClient();

const App = () => {
  // Initialize canvas on mount
  React.useEffect(() => {
    const initCanvas = async () => {
      // Dynamic import to ensure canvas is ready
      const { initKeynoteCanvas } = await import('./utils/keynoteCanvas');
      setTimeout(() => {
        initKeynoteCanvas();
      }, 200);
    };
    initCanvas();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="dark">
          <Toaster />
          <Sonner />
          <BrowserRouter>
          <Routes>
            {/* Public route - login page */}
            <Route path="/login" element={<Login />} />
            
            {/* Protected routes - require authentication */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/jails"
              element={
                <ProtectedRoute>
                  <Jails />
                </ProtectedRoute>
              }
            />
            <Route
              path="/jail-editor/:name"
              element={
                <ProtectedRoute>
                  <JailEditor />
                </ProtectedRoute>
              }
            />
            <Route
              path="/filters/create"
              element={
                <ProtectedRoute>
                  <CreateFilter />
                </ProtectedRoute>
              }
            />
            <Route
              path="/logs"
              element={
                <ProtectedRoute>
                  <LiveLog />
                </ProtectedRoute>
              }
            />
            <Route
              path="/servers"
              element={
                <ProtectedRoute>
                  <Servers />
                </ProtectedRoute>
              }
            />
            <Route
              path="/servers/:id"
              element={
                <ProtectedRoute>
                  <ServerDetail />
                </ProtectedRoute>
              }
            />
            
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </BrowserRouter>
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
