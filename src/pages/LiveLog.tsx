import { useEffect, useRef, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Play, Square, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export default function LiveLog() {
  const [logs, setLogs] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const connect = () => {
    try {
      // Get backend URL from environment or use default
      const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const wsProtocol = backendUrl.startsWith('https') ? 'wss:' : 'ws:';
      // Extract host:port from URL
      const urlMatch = backendUrl.match(/^https?:\/\/([^\/]+)/);
      const wsHost = urlMatch ? urlMatch[1] : 'localhost:3001';
      const wsUrl = `${wsProtocol}//${wsHost}/ws/logs`;
      
      console.log('[LiveLog] Connecting to:', wsUrl);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setError(null);
        setLogs([]);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'log' && data.line) {
            setLogs((prev) => {
              const newLogs = [...prev, data.line];
              // Keep only last 1000 lines
              return newLogs.slice(-1000);
            });
          } else if (data.type === 'error') {
            setError(data.message || 'Unknown error');
          } else if (data.type === 'connected') {
            // Connection established
          }
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
        }
      };

      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        setError('WebSocket connection error');
        setIsConnected(false);
      };

      ws.onclose = () => {
        setIsConnected(false);
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
      setIsConnected(false);
    }
  };

  const disconnect = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  };

  useEffect(() => {
    // Auto-connect on mount
    connect();

    return () => {
      disconnect();
    };
  }, []);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const clearLogs = () => {
    setLogs([]);
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-mono text-2xl font-bold text-foreground terminal-glow">
              <span className="text-primary">&gt;</span> Live Log
            </h1>
            <p className="font-mono text-sm text-muted-foreground">
              Real-time fail2ban log stream
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={clearLogs}
              disabled={logs.length === 0}
            >
              Clear
            </Button>
            {isConnected ? (
              <Button variant="outline" onClick={disconnect}>
                <Square className="h-4 w-4 mr-2" />
                Stop
              </Button>
            ) : (
              <Button variant="outline" onClick={connect}>
                <Play className="h-4 w-4 mr-2" />
                Connect
              </Button>
            )}
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Connection Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="terminal-card">
          <div className="scanlines" />
          <div className="relative z-10 p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "h-2 w-2 rounded-full",
                    isConnected ? "bg-success pulse-glow" : "bg-muted-foreground"
                  )}
                />
                <span className="font-mono text-xs text-muted-foreground">
                  {isConnected ? "Connected" : "Disconnected"}
                </span>
              </div>
              <span className="font-mono text-xs text-muted-foreground">
                {logs.length} lines
              </span>
            </div>
            <div
              ref={logContainerRef}
              className="font-mono text-xs h-[600px] overflow-y-auto bg-background/50 p-4 rounded border border-border"
            >
              {logs.length === 0 ? (
                <div className="text-muted-foreground text-center py-8">
                  {isConnected ? "Waiting for log entries..." : "Not connected"}
                </div>
              ) : (
                logs.map((log, index) => (
                  <div
                    key={index}
                    className="mb-1 text-foreground/80 hover:text-foreground transition-colors"
                  >
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}

