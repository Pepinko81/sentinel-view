import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createJail } from "@/lib/apiService";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface JailBuilderProps {}

interface JailFormData {
  name: string;
  filter: string;
  logpath: string;
  maxretry: number;
  findtime: number;
  bantime: number;
  action: string;
}

const PRESETS = {
  nginx: {
    name: "",
    filter: "nginx-limit-req",
    logpath: "/var/log/nginx/access.log",
    maxretry: 5,
    findtime: 600,
    bantime: 3600,
    action: "iptables-multiport",
  },
  ssh: {
    name: "",
    filter: "sshd",
    logpath: "/var/log/auth.log",
    maxretry: 3,
    findtime: 600,
    bantime: 3600,
    action: "iptables-multiport",
  },
  custom: {
    name: "",
    filter: "",
    logpath: "",
    maxretry: 3,
    findtime: 600,
    bantime: 3600,
    action: "iptables-multiport",
  },
};

export function JailBuilder({}: JailBuilderProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [preset, setPreset] = useState<"nginx" | "ssh" | "custom">("custom");
  const [formData, setFormData] = useState<JailFormData>(PRESETS.custom);

  const createMutation = useMutation({
    mutationFn: (data: JailFormData) => createJail(data),
    onSuccess: (_, data) => {
      queryClient.invalidateQueries({ queryKey: ["jails"] });
      toast({
        title: "Jail Created",
        description: `Successfully created and started jail "${data.name}"`,
      });
      // Reset form
      setFormData(PRESETS.custom);
      setPreset("custom");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create jail",
        variant: "destructive",
      });
    },
  });

  const handlePresetChange = (value: "nginx" | "ssh" | "custom") => {
    setPreset(value);
    setFormData(PRESETS[value]);
  };

  const handleInputChange = (field: keyof JailFormData, value: string | number) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  return (
    <div className="space-y-6">
      {/* Warning Banner */}
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Advanced Users Only</AlertTitle>
        <AlertDescription>
          Creating jails requires system knowledge. Ensure you understand fail2ban
          configuration before proceeding. Incorrect configurations may affect
          system security.
        </AlertDescription>
      </Alert>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Preset Selector */}
        <div>
          <Label htmlFor="preset" className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-2 block">
            Preset Configuration
          </Label>
          <Select value={preset} onValueChange={handlePresetChange}>
            <SelectTrigger className="font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="nginx">Nginx Access Log</SelectItem>
              <SelectItem value="ssh">SSH</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Jail Name */}
        <div>
          <Label htmlFor="name" className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-2 block">
            Jail Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="name"
            type="text"
            value={formData.name}
            onChange={(e) => handleInputChange("name", e.target.value)}
            placeholder="e.g., nginx-custom"
            required
            className="font-mono"
            pattern="[a-zA-Z0-9._\-]+"
            title="Only alphanumeric characters, dots, dashes, and underscores allowed"
          />
          <p className="font-mono text-xs text-muted-foreground mt-1">
            Only alphanumeric characters, dots, dashes, and underscores
          </p>
        </div>

        {/* Filter */}
        <div>
          <Label htmlFor="filter" className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-2 block">
            Filter <span className="text-destructive">*</span>
          </Label>
          <Input
            id="filter"
            type="text"
            value={formData.filter}
            onChange={(e) => handleInputChange("filter", e.target.value)}
            placeholder="e.g., nginx-limit-req"
            required
            className="font-mono"
          />
          <p className="font-mono text-xs text-muted-foreground mt-1">
            Filter name (without .conf extension). Filter file must exist in /etc/fail2ban/filter.d/
          </p>
        </div>

        {/* Log Path */}
        <div>
          <Label htmlFor="logpath" className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-2 block">
            Log Path <span className="text-destructive">*</span>
          </Label>
          <Input
            id="logpath"
            type="text"
            value={formData.logpath}
            onChange={(e) => handleInputChange("logpath", e.target.value)}
            placeholder="e.g., /var/log/nginx/access.log"
            required
            className="font-mono"
          />
          <p className="font-mono text-xs text-muted-foreground mt-1">
            Full path to the log file to monitor
          </p>
        </div>

        {/* Max Retry */}
        <div>
          <Label htmlFor="maxretry" className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-2 block">
            Max Retry
          </Label>
          <Input
            id="maxretry"
            type="number"
            value={formData.maxretry}
            onChange={(e) => handleInputChange("maxretry", parseInt(e.target.value, 10) || 3)}
            min="1"
            className="font-mono"
          />
          <p className="font-mono text-xs text-muted-foreground mt-1">
            Number of failures before ban (default: 3)
          </p>
        </div>

        {/* Find Time */}
        <div>
          <Label htmlFor="findtime" className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-2 block">
            Find Time (seconds)
          </Label>
          <Input
            id="findtime"
            type="number"
            value={formData.findtime}
            onChange={(e) => handleInputChange("findtime", parseInt(e.target.value, 10) || 600)}
            min="1"
            className="font-mono"
          />
          <p className="font-mono text-xs text-muted-foreground mt-1">
            Time window to count failures (default: 600)
          </p>
        </div>

        {/* Ban Time */}
        <div>
          <Label htmlFor="bantime" className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-2 block">
            Ban Time (seconds)
          </Label>
          <Input
            id="bantime"
            type="number"
            value={formData.bantime}
            onChange={(e) => handleInputChange("bantime", parseInt(e.target.value, 10) || 3600)}
            min="1"
            className="font-mono"
          />
          <p className="font-mono text-xs text-muted-foreground mt-1">
            Duration of ban (default: 3600)
          </p>
        </div>

        {/* Action */}
        <div>
          <Label htmlFor="action" className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-2 block">
            Action
          </Label>
          <Input
            id="action"
            type="text"
            value={formData.action}
            onChange={(e) => handleInputChange("action", e.target.value)}
            placeholder="iptables-multiport"
            className="font-mono"
          />
          <p className="font-mono text-xs text-muted-foreground mt-1">
            Action to take when ban is triggered (default: iptables-multiport)
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
              "Create & Enable Jail"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

