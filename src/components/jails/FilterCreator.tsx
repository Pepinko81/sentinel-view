import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CreateFilterPayload } from "@/lib/apiService";

interface FilterCreatorProps {
  onCreateFilter: (payload: CreateFilterPayload) => void;
  isCreating: boolean;
}

export function FilterCreator({ onCreateFilter, isCreating }: FilterCreatorProps) {
  const [name, setName] = useState("");
  const [failregex, setFailregex] = useState("");
  const [ignoreregex, setIgnoreregex] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate
    if (!name.trim()) {
      setError("Filter name is required");
      return;
    }

    if (!/^[a-zA-Z0-9-]+$/.test(name.trim())) {
      setError("Filter name must contain only letters, numbers, and dashes");
      return;
    }

    if (!failregex.trim()) {
      setError("failregex pattern is required");
      return;
    }

    onCreateFilter({
      name: name.trim(),
      failregex: failregex.trim(),
      ignoreregex: ignoreregex.trim() || undefined,
    });

    // Reset form on success (will be handled by parent)
    setName("");
    setFailregex("");
    setIgnoreregex("");
  };

  return (
    <div className="terminal-card p-6">
      <div className="scanlines" />
      <div className="relative z-10 space-y-6">
        <div>
          <h2 className="font-mono text-lg font-bold text-foreground mb-2">
            Create Fail2ban Filter
          </h2>
          <p className="font-mono text-sm text-muted-foreground">
            Create a new filter file that will be used by fail2ban to detect attacks.
            The filter will be created at <code className="text-xs bg-muted px-1 py-0.5 rounded">/etc/fail2ban/filter.d/</code>
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription className="font-mono text-sm">{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="filter-name" className="font-mono text-sm">
              Filter Name
            </Label>
            <Input
              id="filter-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="nginx-custom-attack"
              className="font-mono"
              disabled={isCreating}
            />
            <p className="text-xs text-muted-foreground font-mono">
              Only letters, numbers, and dashes allowed
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="failregex" className="font-mono text-sm">
              Fail Regex Pattern <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="failregex"
              value={failregex}
              onChange={(e) => setFailregex(e.target.value)}
              placeholder='^&lt;HOST&gt; -.*"(GET|POST).*\/\.env.*HTTP.*'
              className="font-mono text-sm"
              rows={4}
              disabled={isCreating}
            />
            <p className="text-xs text-muted-foreground font-mono">
              Use <code className="bg-muted px-1 py-0.5 rounded">&lt;HOST&gt;</code> as a placeholder for the IP address
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ignoreregex" className="font-mono text-sm">
              Ignore Regex Pattern (Optional)
            </Label>
            <Textarea
              id="ignoreregex"
              value={ignoreregex}
              onChange={(e) => setIgnoreregex(e.target.value)}
              placeholder='^&lt;HOST&gt; -.*"GET.*\/robots\.txt.*HTTP.*'
              className="font-mono text-sm"
              rows={3}
              disabled={isCreating}
            />
            <p className="text-xs text-muted-foreground font-mono">
              Patterns that should be ignored even if they match failregex
            </p>
          </div>

          <Button
            type="submit"
            disabled={isCreating || !name.trim() || !failregex.trim()}
            className="font-mono"
          >
            {isCreating ? "Creating..." : "Create Filter"}
          </Button>
        </form>

        <div className="mt-6 p-4 bg-muted/30 rounded border border-border/50">
          <h3 className="font-mono text-sm font-semibold mb-2">Example:</h3>
          <pre className="font-mono text-xs text-muted-foreground overflow-x-auto">
{`Filter Name: nginx-hidden-files
Fail Regex: ^<HOST> -.*"(GET|POST).*\/\\.env.*HTTP.*
Ignore Regex: ^<HOST> -.*"GET.*\/robots\\.txt.*HTTP.*`}
          </pre>
        </div>
      </div>
    </div>
  );
}

