import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFilter } from "@/lib/apiService";
import { useJails } from "@/hooks/useJails";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface JailBuilderProps {}

interface FilterFormData {
  jailName: string;
  name: string;
  failregex: string;
  ignoreregex: string;
}

export function JailBuilder({}: JailBuilderProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { jails } = useJails();
  const [formData, setFormData] = useState<FilterFormData>({
    jailName: "",
    name: "",
    failregex: "",
    ignoreregex: "",
  });

  // Get unique jail names from configured jails
  const jailNames = Array.from(new Set(jails.map((j) => j.name))).sort();

  const createMutation = useMutation({
    mutationFn: (data: { name: string; failregex: string; ignoreregex?: string }) =>
      createFilter(data),
    onSuccess: (_, data) => {
      queryClient.invalidateQueries({ queryKey: ["jails"] });
      toast({
        title: "Filter Created",
        description: `Filter "${data.name}" created. Fail2ban restarted.`,
      });
      // Reset form
      setFormData({
        jailName: "",
        name: "",
        failregex: "",
        ignoreregex: "",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create filter",
        variant: "destructive",
      });
    },
  });

  const handleJailChange = (jailName: string) => {
    setFormData((prev) => ({
      ...prev,
      jailName: jailName,
      // Auto-fill filter name based on jail name
      name: jailName || "",
    }));
  };

  const handleInputChange = (field: keyof FilterFormData, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.failregex) {
      toast({
        title: "Validation Error",
        description: "Filter name and failregex are required",
        variant: "destructive",
      });
      return;
    }

    createMutation.mutate({
      name: formData.name,
      failregex: formData.failregex,
      ignoreregex: formData.ignoreregex || undefined,
    });
  };

  return (
    <div className="space-y-6">
      {/* Warning Banner */}
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Advanced Users Only</AlertTitle>
        <AlertDescription>
          Creating filters requires understanding of fail2ban regex patterns. Ensure you understand
          fail2ban filter syntax before proceeding. Incorrect patterns may affect system security.
        </AlertDescription>
      </Alert>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Jail Name Dropdown */}
        <div>
          <Label
            htmlFor="jailName"
            className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-2 block"
          >
            Jail Name <span className="text-destructive">*</span>
          </Label>
          <Select value={formData.jailName} onValueChange={handleJailChange}>
            <SelectTrigger className="font-mono">
              <SelectValue placeholder="Select a jail..." />
            </SelectTrigger>
            <SelectContent>
              {jailNames.map((jailName) => (
                <SelectItem key={jailName} value={jailName}>
                  {jailName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="font-mono text-xs text-muted-foreground mt-1">
            Select the jail this filter will be used for
          </p>
        </div>

        {/* Filter Name */}
        <div>
          <Label
            htmlFor="name"
            className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-2 block"
          >
            Filter Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="name"
            type="text"
            value={formData.name}
            onChange={(e) => handleInputChange("name", e.target.value)}
            placeholder="e.g., nginx-custom"
            required
            className="font-mono"
            pattern="[a-zA-Z0-9\-]+"
            title="Only letters, numbers, and dashes allowed"
          />
          <p className="font-mono text-xs text-muted-foreground mt-1">
            Filter name (letters, numbers, and dashes only). Will create /etc/fail2ban/filter.d/&lt;name&gt;.conf
          </p>
        </div>

        {/* Failregex */}
        <div>
          <Label
            htmlFor="failregex"
            className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-2 block"
          >
            Failregex Pattern <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="failregex"
            value={formData.failregex}
            onChange={(e) => handleInputChange("failregex", e.target.value)}
            placeholder="e.g., ^&lt;HOST&gt; -.*&quot;(GET|POST).*&quot; HTTP.* 404"
            required
            className="font-mono min-h-[100px]"
          />
          <p className="font-mono text-xs text-muted-foreground mt-1">
            Regular expression pattern to match failed login attempts. Use &lt;HOST&gt; to capture IP address.
          </p>
        </div>

        {/* Ignoreregex (Optional) */}
        <div>
          <Label
            htmlFor="ignoreregex"
            className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-2 block"
          >
            Ignoreregex Pattern (Optional)
          </Label>
          <Textarea
            id="ignoreregex"
            value={formData.ignoreregex}
            onChange={(e) => handleInputChange("ignoreregex", e.target.value)}
            placeholder="e.g., ^&lt;HOST&gt; -.*&quot;GET /favicon.ico&quot;"
            className="font-mono min-h-[80px]"
          />
          <p className="font-mono text-xs text-muted-foreground mt-1">
            Optional pattern to ignore (exclude from matching). Leave empty if not needed.
          </p>
        </div>

        {/* Submit Button */}
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={createMutation.isPending}
            className="font-mono"
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Filter"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
