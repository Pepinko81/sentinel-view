import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFilter } from "@/lib/apiService";
import { Loader2, FileText, AlertTriangle } from "lucide-react";

export default function CreateFilter() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [failregex, setFailregex] = useState("");
  const [ignoreregex, setIgnoreregex] = useState("");

  const createMutation = useMutation({
    mutationFn: () => createFilter({
      name,
      failregex,
      ignoreregex: ignoreregex || undefined,
    }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["jails"] });
      toast({
        title: "Filter Created",
        description: response.message || "Filter created and fail2ban restarted",
      });
      // Reset form
      setName("");
      setFailregex("");
      setIgnoreregex("");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create filter",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !failregex) {
      toast({
        title: "Validation Error",
        description: "Filter name and failregex are required",
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate();
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-mono text-2xl font-bold text-foreground terminal-glow">
            <span className="text-primary">&gt;</span> Create Filter
          </h1>
          <p className="font-mono text-sm text-muted-foreground">
            Create a new fail2ban filter file
          </p>
        </div>

        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Advanced Users Only</AlertTitle>
          <AlertDescription>
            Creating filters requires understanding of fail2ban regex patterns. Ensure you understand
            fail2ban filter syntax before proceeding. Incorrect patterns may affect system security.
          </AlertDescription>
        </Alert>

        <form onSubmit={handleSubmit} className="terminal-card">
          <div className="scanlines" />
          <div className="relative z-10 p-6 space-y-6">
            <div>
              <Label htmlFor="name" className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-2 block">
                Filter Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-custom-filter"
                className="font-mono"
                required
              />
              <p className="font-mono text-xs text-muted-foreground mt-1">
                Only alphanumeric characters, dots, dashes, and underscores allowed
              </p>
            </div>

            <div>
              <Label htmlFor="failregex" className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-2 block">
                Fail Regex <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="failregex"
                value={failregex}
                onChange={(e) => setFailregex(e.target.value)}
                placeholder='^&lt;HOST&gt; -.*"(GET|POST).*\/\.env.*HTTP.*'
                className="font-mono text-sm min-h-[120px]"
                required
              />
              <p className="font-mono text-xs text-muted-foreground mt-1">
                Regular expression to match failed login attempts. Use &lt;HOST&gt; to capture IP address.
              </p>
            </div>

            <div>
              <Label htmlFor="ignoreregex" className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-2 block">
                Ignore Regex (Optional)
              </Label>
              <Textarea
                id="ignoreregex"
                value={ignoreregex}
                onChange={(e) => setIgnoreregex(e.target.value)}
                placeholder='^&lt;HOST&gt; -.*"GET.*\/robots\.txt.*HTTP.*'
                className="font-mono text-sm min-h-[100px]"
              />
              <p className="font-mono text-xs text-muted-foreground mt-1">
                Regular expression to ignore certain patterns (e.g., legitimate requests)
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="submit"
                disabled={!name || !failregex || createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4 mr-2" />
                    Create Filter
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </MainLayout>
  );
}

