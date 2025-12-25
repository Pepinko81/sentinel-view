import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { readJailConfig, writeJailConfig, restartFail2ban } from "@/lib/apiService";
import { Loader2, Save, RefreshCw, AlertCircle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function JailEditor() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");
  const [hasChanges, setHasChanges] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["jailConfig", name],
    queryFn: () => readJailConfig(name!),
    enabled: !!name,
  });

  useEffect(() => {
    if (data?.content) {
      setContent(data.content);
      setHasChanges(false);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => writeJailConfig(name!, content, data?.path),
    onSuccess: () => {
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ["jailConfig", name] });
      toast({
        title: "Configuration Saved",
        description: "Jail configuration saved successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save configuration",
        variant: "destructive",
      });
    },
  });

  const restartMutation = useMutation({
    mutationFn: () => restartFail2ban(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jails"] });
      toast({
        title: "Fail2ban Restarted",
        description: "Service restarted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Restart Failed",
        description: error.message || "Failed to restart fail2ban",
        variant: "destructive",
      });
    },
  });

  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    setHasChanges(newContent !== data?.content);
  };

  if (!name) {
    return (
      <MainLayout>
        <div className="terminal-card p-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>No jail name provided</AlertDescription>
          </Alert>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-mono text-2xl font-bold text-foreground terminal-glow">
              <span className="text-primary">&gt;</span> Jail Editor: {name}
            </h1>
            <p className="font-mono text-sm text-muted-foreground">
              Edit jail configuration file
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Reload
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Restart Fail2ban
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Restart Fail2ban?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will restart the fail2ban service. All jails with enabled=true will be started.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => restartMutation.mutate()}
                    disabled={restartMutation.isPending}
                  >
                    {restartMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Restarting...
                      </>
                    ) : (
                      "Restart"
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              {error instanceof Error ? error.message : "Failed to load configuration"}
            </AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="terminal-card p-6">
            <div className="flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          </div>
        ) : (
          <div className="terminal-card">
            <div className="scanlines" />
            <div className="relative z-10 p-6 space-y-4">
              <div>
                <Label htmlFor="config-content" className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-2 block">
                  Configuration File: {data?.path}
                </Label>
                <Textarea
                  id="config-content"
                  value={content}
                  onChange={(e) => handleContentChange(e.target.value)}
                  className="font-mono text-sm min-h-[400px]"
                  placeholder="[jail-name]&#10;enabled = true&#10;filter = ..."
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  onClick={() => saveMutation.mutate()}
                  disabled={!hasChanges || saveMutation.isPending}
                >
                  {saveMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}

