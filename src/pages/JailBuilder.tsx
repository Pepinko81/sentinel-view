import { MainLayout } from "@/components/layout/MainLayout";
import { JailBuilder } from "@/components/jails/JailBuilder";

export default function JailBuilderPage() {
  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="font-mono text-2xl font-bold text-foreground terminal-glow">
            <span className="text-primary">&gt;</span> Jail Builder
          </h1>
          <p className="font-mono text-sm text-muted-foreground">
            Create and configure new fail2ban jails
          </p>
        </div>

        {/* Jail Builder Component */}
        <JailBuilder />
      </div>
    </MainLayout>
  );
}

