import { Link, useRouterState, type LinkProps } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  LayoutDashboard,
  Users,
  BarChart3,
  UserPlus,
  Award,
  Cake,
  DatabaseBackup,
  DoorOpen,
  KeyRound,
  HeartPulse,
  MessageSquare,
  ScrollText,
  Settings,
  UserCog,
  ClipboardCheck,
  ShieldAlert,
  FileBarChart,
  Trophy,
  ArrowUpRight,
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
import { useUnreadCountQuery } from "@/data/notification-store";
import { useCurrentAccount } from "@/lib/session";
import type { AccountProfile, Permission } from "@/lib/session";
import {
  getEffectiveRole,
  isFullAccessRole,
  isSuperAdminRole,
  hasPermission,
} from "@/lib/permissions";
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
  /** Shows a live count pill on the item. "unread-notifications" is the signed-in
   * account's unread notification count (the Notifications module). */
  badge?: "unread-notifications";
};

/** A link out to another TGO app (opens in a new tab). Kept apart from NavItem
 * so the header search, which navigates in-app, never sees it. No permission
 * gate: the other app does its own sign-in. */
export type ExternalNavItem = { title: string; href: string; icon: LucideIcon };

export const NAV_GROUPS: { label: string; items: NavItem[]; external?: ExternalNavItem[] }[] = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", url: "/", icon: LayoutDashboard },
      // Everyone has their own inbox, so there's no permission gate — same as
      // Settings and Feedback. It only ever shows the caller's own notifications.
      { title: "Notifications", url: "/notifications", icon: Bell, badge: "unread-notifications" },
    ],
  },
  {
    label: "People",
    items: [
      { title: "Employee Directory", url: "/directory", icon: Users, permission: "employees.view" },
      {
        title: "Onboarding New Hires",
        url: "/new-hires",
        icon: UserPlus,
        permission: "new_hires.view",
      },
      {
        title: "Onboarding Tracker",
        url: "/onboarding",
        icon: ClipboardCheck,
        permission: "onboarding.view",
      },
    ],
    external: [
      {
        title: "Onboarding and Offboarding Portal",
        href: "https://tgo-onboarding-and-offboarding-portal-production-f4a8.up.railway.app/",
        icon: DoorOpen,
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
      {
        title: "Activity Logs",
        url: "/activity-logs",
        icon: ScrollText,
        permission: "activity_logs.view",
      },
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
      { title: "API Access", url: "/api-access", icon: KeyRound, superAdminOnly: true },
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

// Frame the globe directly from the official logo rather than recreating the artwork.
function TgoGlobeIcon() {
  return (
    <svg
      className="h-4 w-4 shrink-0"
      viewBox="809 181 246 246"
      aria-hidden="true"
      focusable="false"
    >
      <image href={logoDark} width="1376" height="768" />
    </svg>
  );
}

export function AppSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const { data: unreadCount } = useUnreadCountQuery();
  const unread = unreadCount ?? 0;
  const collapsed = !isMobile && state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { data: account } = useCurrentAccount();
  const effectiveRole = getEffectiveRole(account);
  const isAdmin = isFullAccessRole(effectiveRole);
  const isSuperAdmin = isSuperAdminRole(effectiveRole);

  return (
    <Sidebar collapsible="icon" className="border-sidebar-border shadow-none">
      <SidebarHeader className={cn("gap-3 bg-white/[0.015] py-4", collapsed ? "px-2" : "px-4")}>
        <Link
          to="/"
          aria-label="TGO Workforce home"
          onClick={() => {
            if (isMobile) setOpenMobile(false);
          }}
          className={cn(
            "flex min-h-11 items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
            collapsed ? "justify-center" : "gap-3",
          )}
        >
          <img
            src={logoDark}
            alt="Torero Global Outsourcing logo"
            width={1000}
            height={521}
            className={cn("shrink-0 object-contain", collapsed ? "h-8 max-w-8" : "h-10 w-auto")}
          />
          {!collapsed && (
            <div
              className="flex min-w-0 flex-col justify-center leading-none"
              aria-label="Workforce Portal"
            >
              <span className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.16em] text-white/90">
                Workforce
              </span>
              <span className="mt-1 whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/65">
                Portal
              </span>
            </div>
          )}
        </Link>
        <div className="h-px w-full bg-sidebar-border" />
      </SidebarHeader>

      <SidebarContent role="navigation" aria-label="Main navigation" className="pb-3">
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
          if (visibleItems.length === 0 && !group.external?.length) return null;

          return (
            <SidebarGroup key={group.label} className="px-2 py-1.5">
              <SidebarGroupLabel className="mb-1 h-7 px-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/70">
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
                        className="workforce-nav-item relative rounded-lg px-4 text-sidebar-foreground/90 transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                      >
                        <Link
                          to={item.url}
                          onClick={() => {
                            if (isMobile) setOpenMobile(false);
                          }}
                          aria-current={isNavItemActive(pathname, item.url) ? "page" : undefined}
                          className="flex items-center gap-2"
                        >
                          <item.icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                          <span>{item.title}</span>
                          {item.badge === "unread-notifications" && unread > 0 && (
                            <>
                              <span
                                className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-sidebar-primary px-1.5 text-[11px] font-semibold leading-none text-sidebar-primary-foreground group-data-[collapsible=icon]:hidden"
                                aria-label={`${unread} unread`}
                              >
                                {unread > 99 ? "99+" : unread}
                              </span>
                              {/* Collapsed to icons: a small dot instead of the number. */}
                              <span
                                className="absolute right-1.5 top-1.5 hidden h-2 w-2 rounded-full bg-sidebar-primary group-data-[collapsible=icon]:block"
                                aria-hidden="true"
                              />
                            </>
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                  {group.external?.map((link) => (
                    <SidebarMenuItem key={link.href}>
                      <SidebarMenuButton
                        asChild
                        tooltip={`${link.title} (opens in a new tab)`}
                        className="workforce-nav-item relative rounded-lg px-4 text-sidebar-foreground/90 transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                      >
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`${link.title} (opens in a new tab)`}
                          onClick={() => {
                            if (isMobile) setOpenMobile(false);
                          }}
                          className="flex items-center gap-2"
                        >
                          <link.icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                          <span>{link.title}</span>
                          <ArrowUpRight
                            className="ml-auto h-3.5 w-3.5 shrink-0 text-sidebar-foreground/50 group-data-[collapsible=icon]:hidden"
                            aria-hidden="true"
                          />
                        </a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border px-2 py-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip="TGO Gateway Portal (opens in a new tab)"
              className="workforce-nav-item relative rounded-lg px-4 text-sidebar-foreground/90 transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            >
              <a
                href="https://gateway.tgocorp.com/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="TGO Gateway Portal (opens in a new tab)"
                onClick={() => {
                  if (isMobile) setOpenMobile(false);
                }}
                className="flex items-center gap-2"
              >
                <TgoGlobeIcon />
                <span>TGO Gateway Portal</span>
                <ArrowUpRight
                  className="ml-auto h-3.5 w-3.5 shrink-0 text-sidebar-foreground/50 group-data-[collapsible=icon]:hidden"
                  aria-hidden="true"
                />
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
