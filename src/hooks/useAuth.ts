import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3010";

interface AuthStatus {
  authenticated: boolean;
  authEnabled: boolean;
  bypass?: string;
}

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [authEnabled, setAuthEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Check authentication status from backend
  const checkAuthStatus = useCallback(async (): Promise<AuthStatus> => {
    try {
      // Include token in Authorization header if available (for cross-site scenarios)
      const token = typeof window !== 'undefined' ? sessionStorage.getItem('authToken') : null;
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch(`${API_URL}/api/auth/status`, {
        method: "GET",
        credentials: "include", // Include cookies (if available and same-site)
        headers,
      });

      if (!response.ok) {
        // If we get 401, user is not authenticated (this is expected)
        if (response.status === 401) {
          setAuthEnabled(true);
          setIsAuthenticated(false);
          return { authenticated: false, authEnabled: true };
        }
        throw new Error(`Failed to check auth status: ${response.status} ${response.statusText}`);
      }

      const data: AuthStatus = await response.json();
      setAuthEnabled(data.authEnabled);
      setIsAuthenticated(data.authenticated);
      return data;
    } catch (error) {
      console.error("Auth check failed:", error);
      // Network errors - check if backend is reachable
      if (error instanceof TypeError && error.message.includes('fetch')) {
        console.warn("Backend not reachable - check VITE_API_URL and ensure backend is running");
      }
      // If auth check fails, assume auth is enabled and user is not authenticated
      setAuthEnabled(true);
      setIsAuthenticated(false);
      return { authenticated: false, authEnabled: true };
    } finally {
      setLoading(false);
    }
  }, []);

  // Login function
  const login = useCallback(async (password: string): Promise<boolean> => {
    try {
      const response = await fetch(`${API_URL}/api/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // Include cookies - CRITICAL for CORS
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        // Try to parse error response
        let errorMessage = "Login failed";
        try {
          const error = await response.json();
          errorMessage = error.error || errorMessage;
        } catch {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      if (data.success) {
        // Store token in sessionStorage for Authorization header
        // This is required for cross-site scenarios where cookies are blocked
        if (data.token) {
          sessionStorage.setItem('authToken', data.token);
        }
        setIsAuthenticated(true);
        // Re-check auth status to verify authentication
        await checkAuthStatus();
        return true;
      }
      return false;
    } catch (error) {
      console.error("Login failed:", error);
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error("Network error: Cannot connect to backend. Check VITE_API_URL and ensure backend is running.");
      }
      throw error;
    }
  }, [checkAuthStatus]);

  // Logout function
  const logout = useCallback(async () => {
    try {
      await fetch(`${API_URL}/api/logout`, {
        method: "POST",
        credentials: "include", // Include cookies
      });
    } catch (error) {
      console.error("Logout failed:", error);
    } finally {
      // Clear fallback token from sessionStorage
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('authToken');
      }
      setIsAuthenticated(false);
      navigate("/login");
    }
  }, [navigate]);

  // Check auth status on mount
  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  // Auto-logout on 401 responses
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      
      // If we get a 401 and auth is enabled, logout
      if (response.status === 401 && authEnabled) {
        const url = args[0]?.toString() || "";
        // Don't logout on login endpoint failures
        if (!url.includes("/api/login") && !url.includes("/api/auth/status")) {
          setIsAuthenticated(false);
          navigate("/login");
        }
      }
      
      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [authEnabled, navigate]);

  return {
    isAuthenticated,
    authEnabled,
    loading,
    checkAuthStatus,
    login,
    logout,
  };
}

