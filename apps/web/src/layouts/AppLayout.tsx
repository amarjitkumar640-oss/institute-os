import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard, Users, UserPlus, BookOpen, Layers,
  Calendar, GraduationCap, UserCog, DollarSign, Settings,
  LogOut, Building2, ChevronDown, Bell, ChevronRight, Globe, FileText, ShieldCheck,
  UserCircle, CheckCircle2,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { getMyProfile } from "@/api/staff";
import { getTenantSettings } from "@/api/tenants";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { cn, initials } from "@/lib/utils";
import { selectCenter as selectCenterApi } from "@/api/auth";

// screenKey: null means always visible (Dashboard) — not part of the
// permission grid. adminOnly mirrors ProtectedRoute's own escape hatch for
// Settings (deliberately excluded from the grid — see ProtectedRoute.tsx).
// Nav visibility and route access now derive from the exact same
// staff.permissions data ProtectedRoute reads, so they can't drift apart the
// way roles-array-here vs roles-prop-there used to.
interface NavItem { label: string; to: string; icon: React.ElementType; screenKey: string | null; adminOnly?: boolean; end?: boolean }
interface NavGroup { module: string; items: NavItem[] }

// Ungrouped, pinned at the very top — Dashboard has no CRUD concept, isn't in
// SCREEN_REGISTRY, and doesn't belong to any one module.
const NAV_TOP: NavItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard, screenKey: null },
];

// Same 4 modules apps/api's SCREEN_REGISTRY groups these exact screens into
// for the Access Control grid — reusing that taxonomy here means the sidebar
// and the permissions page can't drift into two different groupings.
const NAV_GROUPS: NavGroup[] = [
  {
    module: "Students",
    items: [
      { label: "Students",     to: "/students",              icon: Users,         screenKey: "students" },
      { label: "Leads",        to: "/leads",                  icon: UserPlus,      screenKey: "leads" },
      { label: "Applications", to: "/admission-applications", icon: FileText,      screenKey: "admission-applications" },
    ],
  },
  {
    module: "Academics",
    items: [
      { label: "Batches",  to: "/batches",  icon: Layers,        screenKey: "batches" },
      { label: "Courses",  to: "/courses",  icon: BookOpen,      screenKey: "courses" },
      { label: "Subjects", to: "/subjects", icon: GraduationCap, screenKey: "subjects" },
      { label: "Faculty",  to: "/faculty",  icon: GraduationCap, screenKey: "faculty" },
      { label: "Schedule", to: "/schedule", icon: Calendar,      screenKey: "schedule" },
    ],
  },
  {
    module: "Finance",
    items: [
      { label: "Fees", to: "/fees", icon: DollarSign, screenKey: "fees" },
    ],
  },
  {
    module: "Organization",
    items: [
      { label: "Staff",         to: "/staff",         icon: UserCog,   screenKey: "staff" },
      { label: "Centers",       to: "/centers",       icon: Building2, screenKey: "centers" },
      { label: "Notifications", to: "/notifications", icon: Bell,      screenKey: "notifications" },
    ],
  },
];

// Ungrouped, admin-only, pinned below a divider at the bottom — same
// self-lockout exclusion as the permission system itself (see ProtectedRoute).
const NAV_BOTTOM: NavItem[] = [
  // end: true — otherwise NavLink's default prefix match treats
  // /settings/permissions as still "within" /settings and lights up both.
  { label: "Settings",       to: "/settings",             icon: Settings,    screenKey: null, adminOnly: true, end: true },
  { label: "Access Control", to: "/settings/permissions", icon: ShieldCheck, screenKey: null, adminOnly: true },
];

// Which module accordions the current browser has manually collapsed —
// persisted so a reload/nav doesn't reset a deliberate choice. Keyed to the
// browser, not the staff account: a shared kiosk device keeps its own layout
// preference regardless of who's logged in.
const NAV_COLLAPSE_KEY = "nav_collapsed_groups";

function loadCollapsedGroups(): Set<string> {
  try {
    const raw = localStorage.getItem(NAV_COLLAPSE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export function AppLayout() {
  const { staff, currentCenter, centers, logout, branding, selectCenter, selectRole } = useAuth();
  const navigate = useNavigate();
  const [switchingCenter, setSwitchingCenter] = useState(false);
  const [switchingRole, setSwitchingRole] = useState(false);

  // Just for the photo — everything else in the sidebar footer already comes
  // from the lean session-scoped `staff` above. Cached across the whole app
  // shell so this fires once per session, not once per page.
  const { data: myProfile } = useQuery({ queryKey: ["my-profile"], queryFn: getMyProfile, staleTime: 5 * 60 * 1000 });
  // `staff`/`branding` (from the login/session payload) never carry the
  // tenant's actual name, only its colors/logo — fetched separately here so
  // the sidebar shows the institute's real name instead of the product name.
  const { data: tenantSettings } = useQuery({ queryKey: ["tenant-settings"], queryFn: getTenantSettings, staleTime: 5 * 60 * 1000 });
  const orgName = tenantSettings?.name ?? "Institute OS";

  async function handleSelectRole(role: "admin" | "teacher" | "frontdesk") {
    if (role === staff?.activeRole) return;
    setSwitchingRole(true);
    try {
      await selectRole(role);
      navigate("/dashboard");
    } finally {
      setSwitchingRole(false);
    }
  }
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(loadCollapsedGroups);

  const primary = branding?.primary ?? "#7C3AED";
  const permissions = staff?.permissions ?? {};

  function isVisible(item: NavItem) {
    if (item.adminOnly) return staff?.activeRole === "admin";
    if (item.screenKey === null) return true;
    return permissions[item.screenKey]?.includes("r") ?? false;
  }

  function toggleGroup(module: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(module)) next.delete(module); else next.add(module);
      localStorage.setItem(NAV_COLLAPSE_KEY, JSON.stringify([...next]));
      return next;
    });
  }

  const visibleTop = NAV_TOP.filter(isVisible);
  // A group with zero visible items (every screen in it denied for this
  // role) gets no header at all — an empty "Finance" section would just be
  // confusing chrome, not a useful signal.
  const visibleGroups = NAV_GROUPS
    .map((g) => ({ module: g.module, items: g.items.filter(isVisible) }))
    .filter((g) => g.items.length > 0);
  const visibleBottom = NAV_BOTTOM.filter(isVisible);

  function renderNavLink(item: NavItem, idx: number) {
    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end}
        className={({ isActive }) =>
          cn(
            "nav-pill-hover flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium animate-slide-in-left",
            isActive
              ? "text-white shadow-sm"
              : "text-gray-500 hover:bg-[var(--color-primary,#7C3AED)]/10 hover:text-[var(--color-primary,#7C3AED)]"
          )
        }
        style={({ isActive }) => ({
          ...(isActive ? { background: primary, boxShadow: `0 4px 16px ${primary}45` } : {}),
          animationDelay: `${idx * 40}ms`,
        })}
      >
        {({ isActive }) => (
          <>
            <item.icon
              className={cn(
                "h-4 w-4 shrink-0 transition-transform duration-200",
                isActive ? "text-white scale-110" : "text-gray-400 group-hover:scale-110"
              )}
            />
            {item.label}
          </>
        )}
      </NavLink>
    );
  }

  useEffect(() => {
    document.documentElement.style.setProperty("--color-primary", primary);
  }, [primary]);

  async function handleSelectCenter(centerId: string | null) {
    setSwitchingCenter(true);
    try {
      const data = await selectCenterApi(centerId);
      selectCenter(data.center, data.accessToken, data.refreshToken, data.roles, data.activeRole, data.permissions);
      navigate("/dashboard");
    } finally {
      setSwitchingCenter(false);
    }
  }

  return (
    <div className="relative h-screen bg-[#EDE9FE] p-3 flex overflow-hidden" style={{ minWidth: "1280px" }}>
      {/* Animated background orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="orb animate-blob absolute opacity-40"
          style={{ width: 420, height: 420, top: "-80px", left: "-80px", background: primary }}
        />
        <div
          className="orb animate-blob-slow absolute opacity-30"
          style={{ width: 500, height: 500, bottom: "-100px", right: "-60px", background: "#A78BFA", animationDelay: "4s" }}
        />
        <div
          className="orb animate-blob absolute opacity-20"
          style={{ width: 300, height: 300, top: "40%", left: "38%", background: "#C4B5FD", animationDelay: "8s" }}
        />
      </div>

      {/* Floating app shell */}
      <div className="relative flex flex-1 rounded-[28px] overflow-hidden shadow-shell bg-white">

        {/* ── White Sidebar ── */}
        <aside
          className="flex h-full w-56 flex-shrink-0 flex-col bg-white animate-slide-in-left"
          style={{ borderRight: "1px solid rgba(109,40,217,0.08)" }}
        >
          {/* Logo */}
          <div className="flex h-16 items-center gap-3 px-5" style={{ borderBottom: "1px solid rgba(109,40,217,0.06)" }}>
            <div className="relative shrink-0">
              {/* Animated pulse ring behind logo */}
              <div
                className="absolute inset-0 rounded-2xl animate-ping-slow opacity-60"
                style={{ background: `${primary}30` }}
              />
              {tenantSettings?.branding.logoUrl ? (
                <img
                  src={tenantSettings.branding.logoUrl}
                  alt={orgName}
                  className="relative h-9 w-9 rounded-2xl object-cover shrink-0"
                />
              ) : (
                <div
                  className="relative flex h-9 w-9 items-center justify-center rounded-2xl text-white font-bold text-sm"
                  style={{
                    background: `linear-gradient(135deg, ${primary}, ${primary}cc)`,
                    boxShadow: `0 4px 14px ${primary}50`,
                  }}
                >
                  {initials(orgName)}
                </div>
              )}
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900 leading-tight truncate max-w-[140px]">{orgName}</p>
              <p className="text-[10px] text-gray-400 leading-tight">Management Suite</p>
            </div>
          </div>

          {/* Center switcher */}
          {centers.length > 1 && (
            <div className="px-3 py-3" style={{ borderBottom: "1px solid rgba(109,40,217,0.06)" }}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex w-full items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-600 hover:bg-[var(--color-primary,#7C3AED)]/10 hover:text-[var(--color-primary,#7C3AED)] transition-all group">
                    <Building2 className="h-3.5 w-3.5 shrink-0 text-gray-400 group-hover:text-[var(--color-primary,#7C3AED)] transition-colors" />
                    <span className="truncate flex-1 text-left font-medium">{currentCenter?.name ?? "All Centers"}</span>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400 group-hover:rotate-180 transition-transform duration-200" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-52" side="right" align="start">
                  <DropdownMenuLabel>Switch Center</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => handleSelectCenter(null)}
                    disabled={switchingCenter}
                    className={cn(!currentCenter && "font-semibold")}
                  >
                    <Globe className="mr-2 h-3.5 w-3.5" />All Centers
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {centers.map((c) => (
                    <DropdownMenuItem
                      key={c.id}
                      onClick={() => handleSelectCenter(c.id)}
                      disabled={switchingCenter}
                      className={cn(currentCenter?.id === c.id && "font-semibold")}
                    >
                      <Building2 className="mr-2 h-3.5 w-3.5" />{c.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
            {visibleTop.map((item, idx) => renderNavLink(item, idx))}

            {visibleGroups.map((group) => {
              const collapsed = collapsedGroups.has(group.module);
              return (
                <div key={group.module}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.module)}
                    className="flex w-full items-center justify-between px-3 pt-4 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 hover:text-[var(--color-primary,#7C3AED)] transition-colors"
                  >
                    <span>{group.module}</span>
                    <ChevronDown
                      className={cn(
                        "h-3 w-3 shrink-0 transition-transform duration-200",
                        collapsed && "-rotate-90"
                      )}
                    />
                  </button>
                  {!collapsed && group.items.map((item, idx) => renderNavLink(item, idx))}
                </div>
              );
            })}

            {visibleBottom.length > 0 && (
              <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(109,40,217,0.06)" }}>
                {visibleBottom.map((item, idx) => renderNavLink(item, idx))}
              </div>
            )}
          </nav>

          {/* User footer */}
          <div className="p-3" style={{ borderTop: "1px solid rgba(109,40,217,0.06)" }}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-[var(--color-primary,#7C3AED)]/10 transition-all duration-200 group">
                  <div className="relative shrink-0">
                    <Avatar className="h-8 w-8">
                      {myProfile?.photoUrl && <AvatarImage src={myProfile.photoUrl} alt={staff?.fullName} />}
                      <AvatarFallback className="text-xs font-bold text-white" style={{ background: primary }}>
                        {initials(staff?.fullName ?? "?")}
                      </AvatarFallback>
                    </Avatar>
                    <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 border-2 border-white" />
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-[13px] font-semibold text-gray-800 truncate leading-tight">{staff?.fullName}</p>
                    <p className="text-[11px] text-gray-400 capitalize leading-tight mt-0.5">{staff?.activeRole}</p>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-[var(--color-primary,#7C3AED)] group-hover:translate-x-0.5 transition-all shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-52" side="right" align="end">
                <DropdownMenuLabel className="font-normal py-2.5">
                  <div className="flex items-center gap-2.5">
                    <Avatar className="h-8 w-8">
                      {myProfile?.photoUrl && <AvatarImage src={myProfile.photoUrl} alt={staff?.fullName} />}
                      <AvatarFallback className="text-xs font-bold text-white" style={{ background: primary }}>
                        {initials(staff?.fullName ?? "?")}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{staff?.fullName}</p>
                      <p className="text-xs text-gray-500 capitalize">{staff?.activeRole}</p>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/profile")} className="gap-2">
                  <UserCircle className="h-4 w-4" />My Profile
                </DropdownMenuItem>

                {/* Role switcher — only shown when you actually hold more than
                    one role here. Switching re-scopes access control
                    server-side, not just this label. Folded into this same
                    popup (was its own separate sidebar row before) as a
                    submenu, so it doesn't crowd the main menu with every
                    role listed flat. */}
                {staff && staff.roles.length > 1 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="gap-2">
                        <UserCog className="h-4 w-4" />
                        <span className="flex-1">Switch Role</span>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {staff.roles.map((r) => (
                          <DropdownMenuItem
                            key={r}
                            onClick={() => handleSelectRole(r)}
                            disabled={switchingRole}
                            className={cn("capitalize gap-2", staff.activeRole === r && "font-semibold")}
                          >
                            {r}
                            {staff.activeRole === r && <CheckCircle2 className="h-3.5 w-3.5 ml-auto text-[var(--color-primary,#7C3AED)]" />}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </>
                )}

                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => { logout(); navigate("/login"); }}
                  className="text-red-500 focus:text-red-600 focus:bg-red-50 gap-2"
                >
                  <LogOut className="h-4 w-4" />Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </aside>

        {/* ── Content area ── */}
        <div className="flex flex-1 flex-col overflow-hidden bg-[#F9F8FE]">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
