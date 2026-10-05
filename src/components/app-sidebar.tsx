import { Link, useRouterState, type LinkProps } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  BarChart3,
  UserPlus,
  Award,
  Cake,
  DatabaseBackup,
  HeartPulse,
  MessageSquare,
  ScrollText,
  Settings,
  UserCog,
  ClipboardCheck,
  ShieldAlert,
  FileBarChart,
  Trophy,
} from "lucide-react";

import logoDark from "@/assets/tgo-logo-dark.png";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useCurrentAccount } from "@/lib/session";
import type { AccountProfile, Permission } from "@/lib/session";
import {
  getEffectiveRole,
  isFullAccessRole,
  isSuperAdminRole,
  hasPermission,
} from "@/lib/permissions";
import { useCircuitBackground } from "@/lib/use-circuit-background";
import { cn } from "@/lib/utils";

export type NavItem = {
  title: string;
  url: NonNullable<LinkProps["to"]>;
  icon: LucideIcon;
  /** Hidden from the nav for every role except "admin"/"super_admin" — the
   * route itself also checks this (and the backend 403s regardless), this
   * just keeps everyone else from seeing a link to a page they can't use. */
  adminOnly?: boolean;
  /** Stricter than adminOnly — hidden from a plain Admin too, only visible to
   * "super_admin" (see isSuperAdminRole). The route itself enforces the same
   * check regardless of what the nav shows. */
  superAdminOnly?: boolean;
  /** Hidden unless the signed-in account's permission matrix grants this (or
   * — if an array — every permission in it). See @/lib/permissions'
   * hasPermission. Module-level view gating, driven by the Super-Admin-
   * editable matrix rather than a fixed role list. Milestones needs an
   * array: its pages read Employee Directory data directly, so without
   * employees.view too they'd load and show nothing. */
  permission?: Permission | Permission[];
};

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Overview",
    items: [{ title: "Dashboard", url: "/", icon: LayoutDashboard }],
  },
  {
    label: "People",
    items: [
      { title: "Employee Directory", url: "/directory", icon: Users, permission: "employees.view" },
      {
        title: "Onboarding New Hires",
        url: "/new-hires",
        icon: UserPlus,
        permission: "employees.view",
      },
      {
        title: "Onboarding Tracker",
        url: "/onboarding",
        icon: ClipboardCheck,
        permission: "onboarding.view",
      },
    ],
  },
  {
    label: "Employee Benefits",
    items: [
      // Placeholder module — HMO Management is a blank page for now, more
      // to follow once it's scoped. Ungated for every non-admin role by
      // default (benefits.view isn't in any role's default grants); a
      // Super Admin turns it on from User Management once there's
      // something real behind it.
      {
        title: "HMO Management",
        url: "/hmo-management",
        icon: HeartPulse,
        permission: "benefits.view",
      },
    ],
  },
  {
    label: "Employee Milestones",
    items: [
      {
        title: "Anniversaries",
        url: "/anniversaries",
        icon: Award,
        permission: ["employees.view", "milestones.view"],
      },
      {
        title: "Birthdays",
        url: "/birthdays",
        icon: Cake,
        permission: ["employees.view", "milestones.view"],
      },
      {
        title: "Recognition & Awards",
        url: "/awards",
        icon: Trophy,
        // Unlike Anniversaries/Birthdays, this reads its own /awards data —
        // no employees.view needed to see the awards list itself, but
        // giving one still requires picking an employee (see awards.tsx).
        permission: "awards.view",
      },
    ],
  },
  {
    label: "Employee Relations",
    items: [
      {
        title: "Violations",
        url: "/attendance-violations",
        icon: ShieldAlert,
        permission: "attendance.view",
      },
      {
        title: "Violations Report",
        url: "/attendance-reports",
        icon: FileBarChart,
        permission: "attendance.view",
      },
    ],
  },
  {
    label: "Insights",
    items: [
      { title: "Activity Logs", url: "/activity-logs", icon: ScrollText },
      // Admin/Super Admin-only: Analytics rolls up numbers across every
      // module (Employee Directory, Onboarding, Attendance), which no single
      // module-siloed role should see in full — see app/routes/analytics.tsx's
      // own isFullAccessRole gate, which enforces this independent of what
      // the nav shows.
      { title: "Analytics", url: "/analytics", icon: BarChart3, adminOnly: true },
      // No permission/adminOnly flag — open to every signed-in role, same as
      // the backend route (see app/api/routes/feedback.py). Only who can
      // *triage* a card (status/priority/reporter identity) differs, and
      // that's enforced inside the page itself, not by hiding the nav link.
      { title: "Feedback", url: "/feedback", icon: MessageSquare },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        title: "User Management",
        url: "/user-management",
        icon: UserCog,
        adminOnly: true,
      },
      {
        title: "Database Backups",
        url: "/database-backups",
        icon: DatabaseBackup,
        superAdminOnly: true,
      },
      { title: "Settings", url: "/settings", icon: Settings },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

// Exact match for "/" (every page would otherwise show Dashboard as active);
// prefix match for everything else, so a detail page nested under a nav
// item's own URL (e.g. /user-management/:accountId under /user-management)
// still highlights that item instead of nothing.
function isNavItemActive(pathname: string, url: string): boolean {
  if (url === "/") return pathname === "/";
  return pathname === url || pathname.startsWith(`${url}/`);
}

function isNavItemVisible(
  permissions: Permission[] | undefined,
  required: Permission | Permission[],
): boolean {
  const requiredList = Array.isArray(required) ? required : [required];
  return requiredList.every((permission) => hasPermission(permissions, permission));
}

// Same gating AppSidebar renders with below, exposed for anything else that
// needs "which pages can this account actually reach" — currently the header
// search (@/components/header-search), so a page nobody can see never shows
// up as a navigable search result either.
export function getAccessibleNavItems(
  account: Pick<AccountProfile, "role" | "sandbox_role" | "permissions"> | null | undefined,
): NavItem[] {
  const effectiveRole = getEffectiveRole(account);
  const isAdmin = isFullAccessRole(effectiveRole);
  const isSuperAdmin = isSuperAdminRole(effectiveRole);
  return NAV_ITEMS.filter(
    (item) =>
      (!item.adminOnly || isAdmin) &&
      (!item.superAdminOnly || isSuperAdmin) &&
      (!item.permission || isNavItemVisible(account?.permissions, item.permission)),
  );
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { data: account } = useCurrentAccount();
  const effectiveRole = getEffectiveRole(account);
  const isAdmin = isFullAccessRole(effectiveRole);
  const isSuperAdmin = isSuperAdminRole(effectiveRole);
  // Circuit line art (see @/lib/circuit-art): a full dark band behind the logo,
  // and a faint rail of stubs down both edges of the nav area. Both go static
  // when "Interface animations" is off in Settings.
  const headerBand = useCircuitBackground("sidebarHeader", "sidebar-header");
  const navBackdrop = useCircuitBackground("sidebar", "sidebar-nav");

  return (
    <Sidebar collapsible="icon" className="shadow-[2px_0_20px_-4px_rgba(0,0,0,0.35)]">
      <SidebarHeader className={cn("gap-3 py-4", collapsed ? "px-2" : "px-4")} style={headerBand}>
        <div className={cn("flex min-h-11 items-center", collapsed ? "justify-center" : "gap-3")}>
          {/* Always the light-on-dark logo variant — the sidebar is a
              constant brand green regardless of the app's light/dark theme,
              so the logo no longer needs to switch with it. */}
          <img
            src={logoDark}
            alt="Torero Global Outsourcing logo"
            width={1000}
            height={521}
            className={cn(
              "shrink-0 object-contain drop-shadow-sm",
              collapsed ? "h-8 max-w-8" : "h-10 w-auto",
            )}
          />

          {!collapsed && (
            <div
              className="flex min-w-0 flex-col justify-center leading-none"
              aria-label="Workforce Portal"
            >
              <span className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/85">
                Workforce
              </span>
              <span className="mt-1 whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/65">
                Portal
              </span>
            </div>
          )}
        </div>
        {/* A thin brand-green underline beneath the header — the one
            deliberate accent stroke that ties the whole navy sidebar back
            to the green used everywhere else in the app. */}
        <div className="h-px w-full bg-gradient-to-r from-[#72b360] via-[#72b360]/40 to-transparent" />
      </SidebarHeader>

      <SidebarContent className="pb-3" style={navBackdrop}>
        {NAV_GROUPS.map((group) => {
          const visibleItems = group.items.filter(
            (item) =>
              (!item.adminOnly || isAdmin) &&
              (!item.superAdminOnly || isSuperAdmin) &&
              (!item.permission || isNavItemVisible(account?.permissions, item.permission)),
          );
          // Skip the whole group (label included) once nothing under it is
          // visible — a bare "Attendance" or "Milestones" header with no
          // links under it (e.g. for a Recruitment Lead with neither
          // attendance.view nor milestones.view) was worse than just not
          // showing the group at all.
          if (visibleItems.length === 0) return null;

          return (
            <SidebarGroup key={group.label} className="px-2 py-1.5">
              <SidebarGroupLabel className="mb-1 h-7 px-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/60">
                {group.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {visibleItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        tooltip={item.title}
                        isActive={isNavItemActive(pathname, item.url)}
                        className={cn(
                          "relative px-4 transition-[width,height,padding,transform] duration-200",
                          "hover:translate-x-0.5",
                          // The green accent bar/icon only ever marks the
                          // active item — hover stays a neutral lightening
                          // (bg-sidebar-accent, from the shared component),
                          // so green reads as "you are here", not "you're
                          // pointing at me".
                          "before:absolute before:inset-y-1.5 before:left-0 before:w-[3px]",
                          "before:rounded-r-full before:bg-[#72b360] before:opacity-0",
                          "before:transition-opacity before:duration-200",
                          "data-[active=true]:before:opacity-100",
                          // Icons come alive on hover (a little lift + tilt)
                          // and settle into a slightly larger, green-tinted
                          // state once their page is the active one.
                          "[&>svg]:transition-[color,transform] [&>svg]:duration-200 [&>svg]:ease-out",
                          "hover:[&>svg]:scale-110 hover:[&>svg]:-rotate-6",
                          "data-[active=true]:[&>svg]:scale-110 data-[active=true]:[&>svg]:text-[#72b360]",
                        )}
                      >
                        <Link to={item.url} className="flex items-center gap-2">
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border" />
    </Sidebar>
  );
}
