import { LayoutDashboard, Shield, Terminal, FileText, FileCode, Radio } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Jails", url: "/jails", icon: Shield },
  { title: "Create Filter", url: "/filters/create", icon: FileText },
  { title: "Live Log", url: "/logs", icon: Radio },
];

// Note: Jail Editor is accessed via /jail-editor/:name from Jails page

export function AppSidebar() {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <SidebarHeader className="border-b border-border p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-primary/20 terminal-border-glow">
            <Terminal className="h-4 w-4 text-primary" />
          </div>
          {!isCollapsed && (
            <div className="flex flex-col">
              <span className="font-mono text-sm font-semibold text-primary terminal-glow">
                FAIL2BAN
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                monitor v2.0
              </span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            {!isCollapsed && "Navigation"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="flex items-center gap-3 px-3 py-2 font-mono text-sm transition-colors hover:bg-primary/10 hover:text-primary"
                      activeClassName="bg-primary/20 text-primary border-l-2 border-primary"
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!isCollapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-border p-4">
        {!isCollapsed && (
          <div className="font-mono text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-primary pulse-glow" />
              <span>System Active</span>
            </div>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
