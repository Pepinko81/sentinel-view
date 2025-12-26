import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import Logo from "@/assets/pepinko-logo.png";
import LogoDark from "@/assets/pepinko-logo-dark.png";
import { useIsMobile } from "@/hooks/use-mobile";

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const isMobile = useIsMobile();

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <SidebarTrigger className="text-muted-foreground hover:text-primary" />
            <div className="flex items-center gap-3">
              <img
                src={Logo}
                alt="Sentinel Dashboard"
                className="light-logo h-6 w-6 shrink-0 object-contain md:h-8 md:w-8"
              />
              <img
                src={LogoDark}
                alt="Sentinel Dashboard"
                className="dark-logo h-6 w-6 shrink-0 object-contain md:h-8 md:w-8"
              />
              {!isMobile && (
                <span className="font-mono text-sm font-semibold text-foreground">
                  Sentinel Dashboard
                </span>
              )}
            </div>
            <div className="flex-1" />
            <div className="font-mono text-xs text-muted-foreground">
              <span className="text-primary">&gt;</span> secure_shell
              <span className="cursor-blink" />
            </div>
          </header>
          <div className="p-6">{children}</div>
        </main>
      </div>
    </SidebarProvider>
  );
}
