import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Users, UserPlus, BookOpen, Layers,
  Calendar, GraduationCap, UserCog, DollarSign, Settings,
  LogOut, Building2, ChevronDown, Bell, ChevronRight,
} from "lucide-react";
import { useAuth, type StaffRole } from "@/context/AuthContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, initials } from "@/lib/utils";
import { apiClient } from "@/api/client";

interface NavItem { label: string; to: string; icon: React.ElementType; roles: StaffRole[] }

const NAV: NavItem[] = [
  { label: "Dashboard",     to: "/dashboard",     icon: LayoutDashboard, roles: ["admin","teacher","frontdesk"] },
  { label: "Students",      to: "/students",      icon: Users,           roles: ["admin","frontdesk"] },
  { label: "Leads",         to: "/leads",         icon: UserPlus,        roles: ["admin","frontdesk"] },
  { label: "Batches",       to: "/batches",       icon: Layers,          roles: ["admin","teacher","frontdesk"] },
  { label: "Courses",       to: "/courses",       icon: BookOpen,        roles: ["admin"] },
  { label: "Subjects",      to: "/subjects",      icon: GraduationCap,   roles: ["admin"] },
  { label: "Faculty",       to: "/faculty",       icon: GraduationCap,   roles: ["admin"] },
  { label: "Staff",         to: "/staff",         icon: UserCog,         roles: ["admin"] },
  { label: "Fees",          to: "/fees",          icon: DollarSign,      roles: ["admin","frontdesk"] },
  { label: "Schedule",      to: "/schedule",      icon: Calendar,        roles: ["admin","teacher"] },
  { label: "Centers",       to: "/centers",       icon: Building2,       roles: ["admin"] },
  { label: "Notifications", to: "/notifications", icon: Bell,            roles: ["admin","teacher","frontdesk"] },
  { label: "Settings",      to: "/settings",      icon: Settings,        roles: ["admin"] },
];

export function AppLayout() {
  const { staff, currentCenter, centers, logout, branding, selectCenter } = useAuth();
  const navigate = useNavigate();
  const [switchingCenter, setSwitchingCenter] = useState(false);

  const role = staff?.role ?? "frontdesk";
  const primary = branding?.primary ?? "#7C3AED";
  const visibleNav = NAV.filter((n) => n.roles.includes(role));

  useEffect(() => {
    document.documentElement.style.setProperty("--color-primary", primary);
  }, [primary]);

  async function handleSelectCenter(centerId: string) {
    setSwitchingCenter(true);
    try {
      const { data } = await apiClient.post<{ accessToken: string; center: { id: string; name: string } | null }>(
        "/api/auth/select-center", { centerId }
      );
      selectCenter(data.center, data.accessToken);
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
              <div
                className="relative flex h-9 w-9 items-center justify-center rounded-2xl text-white font-bold text-sm"
                style={{
                  background: `linear-gradient(135deg, ${primary}, ${primary}cc)`,
                  boxShadow: `0 4px 14px ${primary}50`,
                }}
              >
                IO
              </div>
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900 leading-tight">Institute OS</p>
              <p className="text-[10px] text-gray-400 leading-tight">Management Suite</p>
            </div>
          </div>

          {/* Center switcher */}
          {centers.length > 1 && (
            <div className="px-3 py-3" style={{ borderBottom: "1px solid rgba(109,40,217,0.06)" }}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex w-full items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-600 hover:bg-violet-50 hover:text-violet-700 transition-all group">
                    <Building2 className="h-3.5 w-3.5 shrink-0 text-gray-400 group-hover:text-violet-500 transition-colors" />
                    <span className="truncate flex-1 text-left font-medium">{currentCenter?.name ?? "All Centers"}</span>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400 group-hover:rotate-180 transition-transform duration-200" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-52" side="right" align="start">
                  <DropdownMenuLabel>Switch Center</DropdownMenuLabel>
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
            {visibleNav.map((item, idx) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "nav-pill-hover flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium animate-slide-in-left",
                    isActive ? "text-white shadow-sm" : "text-gray-500 hover:bg-violet-50 hover:text-violet-700"
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
            ))}
          </nav>

          {/* User footer */}
          <div className="p-3" style={{ borderTop: "1px solid rgba(109,40,217,0.06)" }}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-violet-50 transition-all duration-200 group">
                  <div className="relative shrink-0">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs font-bold text-white" style={{ background: primary }}>
                        {initials(staff?.fullName ?? "?")}
                      </AvatarFallback>
                    </Avatar>
                    <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 border-2 border-white" />
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-[13px] font-semibold text-gray-800 truncate leading-tight">{staff?.fullName}</p>
                    <p className="text-[11px] text-gray-400 capitalize leading-tight mt-0.5">{staff?.role}</p>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-violet-400 group-hover:translate-x-0.5 transition-all shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-52" side="right" align="end">
                <DropdownMenuLabel className="font-normal py-2.5">
                  <div className="flex items-center gap-2.5">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs font-bold text-white" style={{ background: primary }}>
                        {initials(staff?.fullName ?? "?")}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{staff?.fullName}</p>
                      <p className="text-xs text-gray-500 capitalize">{staff?.role}</p>
                    </div>
                  </div>
                </DropdownMenuLabel>
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
