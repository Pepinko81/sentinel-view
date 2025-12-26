import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Logo from "@/assets/pepinko-logo.png";
import LogoDark from "@/assets/pepinko-logo-dark.png";
import { useAuth } from "@/hooks/useAuth";

export default function Login() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { isAuthenticated, authEnabled, loading: authLoading, checkAuthStatus, login } = useAuth();

  // Redirect if already authenticated
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate("/", { replace: true });
    }
  }, [isAuthenticated, authLoading, navigate]);

  // If auth is disabled, redirect to dashboard
  useEffect(() => {
    if (!authLoading && !authEnabled) {
      navigate("/", { replace: true });
    }
  }, [authEnabled, authLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const success = await login(password);
      if (success) {
        navigate("/");
      } else {
        setError("Invalid password. Please try again.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto flex justify-center">
            <img
              src={Logo}
              alt="Sentinel Dashboard"
              className="light-logo h-32 w-32 object-contain"
            />
            <img
              src={LogoDark}
              alt="Sentinel Dashboard"
              className="dark-logo h-32 w-32 object-contain"
            />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">Sentinel Dashboard</CardTitle>
            <CardDescription className="mt-2">
              Fail2Ban Security Monitor
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                autoFocus
                disabled={loading}
                className="font-mono"
              />
            </div>

            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={loading || !password}
            >
              {loading ? "Authenticating..." : "Login"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

