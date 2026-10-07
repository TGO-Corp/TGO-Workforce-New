import { useEffect, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ChevronDown, FlaskConical, LogOut, User, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { AppSidebar } from "@/components/app-sidebar";
import { HeaderSearch } from "@/components/header-search";
import { INTRO_SESSION_KEY, IntroGate } from "@/components/intro-overlay";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "@/components/notification-bell";
import { SandboxBanner } from "@/components/sandbox-banner";
import { Button } from "@/components/ui/button";
import { signOut, useCurrentAccount, useEnterSandbox } from "@/lib/session";
import { ROLE_LABELS, SANDBOXABLE_ROLES } from "@/lib/roles";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();

  // Auth guard — runs client-side only (TanStack Start's beforeLoad executes
  // during SSR, where there's no cookie-bearing fetch context to check
  // against, so we check post-mount here instead). Backed by the same
  // React Query cache every other page reads (useCurrentAccount) rather than
  // a one-off fetch into local state, so this shell picks up changes made
  // elsewhere — a sandbox switch, a preferences save — without a full
  // reload. Bounces to /login once the query resolves to "nobody"; renders
  // nothing until then so a signed-out visitor never sees a dashboard flash.
  const { data: account, isLoading } = useCurrentAccount();

  useEffect(() => {
    if (!isLoading && !account) {
      navigate({ to: "/login" });
    }
  }, [isLoading, account, navigate]);

  async function handleSignOut() {
    // The next sign-in gets the intro again.
    try {
      sessionStorage.removeItem(INTRO_SESSION_KEY);
    } catch {
      // ignore
    }
    const gatewayLogoutUrl = await signOut();
    if (gatewayLogoutUrl) {
      window.location.href = gatewayLogoutUrl;
      return;
    }
    navigate({ to: "/login" });
  }

  const enterSandbox = useEnterSandbox();

  async function handleEnterSandbox(role: (typeof SANDBOXABLE_ROLES)[number]) {
    try {
      await enterSandbox.mutateAsync(role);
      toast.success(`Sandboxing as ${ROLE_LABELS[role]}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't enter sandbox");
    }
  }

  if (isLoading || !account) {
    return null;
  }

  const displayName =
    account.display_name ||
    [account.first_name, account.last_name].filter(Boolean).join(" ") ||
    account.email;
  const initials =
    displayName
      .split(" ")
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  return (
    <IntroGate enabled={account.animations_enabled ?? true}>
      <SidebarProvider>
        <div className="flex min-h-screen w-full bg-background">
          <AppSidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur">
              <SidebarTrigger />
              <Separator orientation="vertical" className="mr-1 h-5" />
              <HeaderSearch />

              <div className="ml-auto flex items-center gap-1">
                <NotificationBell />
                <ThemeToggle />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-9 gap-2 px-2">
                      <Avatar className="size-7">
                        {account.photo_url && (
                          <AvatarImage src={account.photo_url} alt={displayName} />
                        )}
                        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                      </Avatar>
                      <span className="hidden text-sm sm:inline">{displayName}</span>
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>
                      <p className="text-sm font-medium">{displayName}</p>
                      <p className="text-xs font-normal text-muted-foreground">{account.email}</p>
                      <Badge variant="secondary" className="mt-1.5 gap-1 font-normal">
                        <ShieldCheck className="h-3 w-3" />
                        {ROLE_LABELS[account.role]}
                      </Badge>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => navigate({ to: "/profile" })}>
                      <User className="mr-2 h-4 w-4" /> Profile
                    </DropdownMenuItem>
                    {/* Keyed off the REAL role, not the effective one — this
                      control (and its sibling in SandboxBanner) must stay
                      reachable no matter what role is currently sandboxed,
                      since it's the only way back. */}
                    {account.role === "super_admin" && (
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <FlaskConical className="mr-2 h-4 w-4" /> Sandbox as...
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          {SANDBOXABLE_ROLES.map((role) => (
                            <DropdownMenuItem
                              key={role}
                              disabled={enterSandbox.isPending || account.sandbox_role === role}
                              onClick={() => handleEnterSandbox(role)}
                            >
                              {ROLE_LABELS[role]}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleSignOut}>
                      <LogOut className="mr-2 h-4 w-4" /> Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </header>
            <SandboxBanner account={account} />
            <main
              key={account.animations_enabled ? pathname : undefined}
              className={
                account.animations_enabled
                  ? "flex-1 p-4 animate-in fade-in slide-in-from-bottom-2 duration-300 md:p-6"
                  : "flex-1 p-4 md:p-6"
              }
            >
              {children}
            </main>
          </div>
        </div>
      </SidebarProvider>
    </IntroGate>
  );
}

export function PageHeader({
  title,
  description,
  action,
  badge,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  /** Small status pill rendered right next to the title — e.g. an "In
   * Progress" tag for a module that's still being built/tested. */
  badge?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {badge}
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}
