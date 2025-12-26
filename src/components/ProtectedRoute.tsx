import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, authEnabled, loading, checkAuthStatus } = useAuth();
  const location = useLocation();

  useEffect(() => {
    // Re-check auth status periodically (every 5 minutes)
    const interval = setInterval(() => {
      checkAuthStatus();
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [checkAuthStatus]);

  // Show loading state while checking auth
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
          <p className="text-muted-foreground">Checking authentication...</p>
        </div>
      </div>
    );
  }

  // If auth is disabled, allow access
  if (!authEnabled) {
    return <>{children}</>;
  }

  // If not authenticated, redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Authenticated - allow access
  return <>{children}</>;
}

