import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Users, Layers, BookOpen, GraduationCap, TrendingUp,
  DollarSign, Calendar, ArrowUpRight, ChevronDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/context/AuthContext";
import { getDashboardStats, getTeacherDashboard } from "@/api/dashboard";
import { cn, formatCurrency, formatDateTime } from "@/lib/utils";
import {
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  Area, AreaChart,
} from "recharts";

// ── Count-up hook ─────────────────────────────────────────────────────────────
function useCountUp(target: number, duration = 1100) {
  const [val, setVal] = useState(0);
  const raf = useRef<number>();
  useEffect(() => {
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(eased * target));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [target, duration]);
  return val;
}

// ── Stat card ─────────────────────────────────────────────────────────────────
interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  iconClass: string;
  countTo?: number;
  delay?: number;
}

function StatCard({ icon: Icon, label, value, sub, iconClass, countTo, delay = 0 }: StatCardProps) {
  const counted = useCountUp(countTo ?? 0, 1100);
  const displayValue = countTo !== undefined ? counted.toLocaleString() : value;

  return (
    <div
      className="bg-white rounded-2xl p-5 border border-purple-50 shadow-stat card-hover shimmer-hover cursor-default animate-slide-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between mb-4">
        <div className={`h-12 w-12 rounded-2xl flex items-center justify-center transition-transform duration-300 hover:scale-110 ${iconClass}`}>
          <Icon className="h-5 w-5" />
        </div>
        {sub && (
          <span className="flex items-center gap-0.5 text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
            <ArrowUpRight className="h-3 w-3" />{sub}
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-gray-900 tabular-nums">{displayValue}</p>
      <p className="text-sm text-gray-400 mt-0.5">{label}</p>
    </div>
  );
}

// ── Gradient card colors ───────────────────────────────────────────────────────
const CARD_GRADIENTS = [
  "from-violet-500 to-purple-700",
  "from-blue-500 to-indigo-700",
  "from-emerald-500 to-teal-700",
  "from-orange-500 to-amber-600",
  "from-pink-500 to-rose-600",
];

function AdminDashboard() {
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: getDashboardStats });
  if (isLoading) return <DashboardSkeleton />;
  if (!data) return null;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Primary stat cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard icon={Users}         label="Total Students"     value={data.totalStudents.toLocaleString()} countTo={data.totalStudents}  iconClass="bg-violet-100 text-violet-600" delay={0} />
        <StatCard icon={Layers}        label="Active Batches"     value={data.activeBatches}                  countTo={data.activeBatches}   sub={`${data.totalBatches} total`} iconClass="bg-blue-100 text-blue-600" delay={80} />
        <StatCard icon={GraduationCap} label="Faculty"            value={data.totalFaculty}                   countTo={data.totalFaculty}    iconClass="bg-emerald-100 text-emerald-600" delay={160} />
        <StatCard icon={DollarSign}    label="Fees Collected"     value={formatCurrency(data.feesCollected)}  iconClass="bg-amber-100 text-amber-600" delay={240} />
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard icon={BookOpen}      label="Courses"            value={data.totalCourses}     countTo={data.totalCourses}     iconClass="bg-cyan-100 text-cyan-600"    delay={320} />
        <StatCard icon={GraduationCap} label="Subjects"           value={data.totalSubjects}    countTo={data.totalSubjects}    iconClass="bg-pink-100 text-pink-600"    delay={380} />
        <StatCard icon={TrendingUp}    label="Active Enrollments" value={data.totalEnrollments} countTo={data.totalEnrollments} iconClass="bg-orange-100 text-orange-600" delay={440} />
      </div>

      {/* Chart + Activity */}
      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2 animate-slide-up" style={{ animationDelay: "200ms" }}>
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Monthly Enrollments</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={data.monthlyEnrollments} margin={{ top: 4, right: 0, left: -28, bottom: 0 }}>
                  <defs>
                    <linearGradient id="enrollGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-primary,#7C3AED)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--color-primary,#7C3AED)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F0FF" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: "14px", border: "none", boxShadow: "0 8px 32px rgba(109,40,217,0.14)", padding: "8px 14px", fontSize: "13px" }}
                    cursor={{ fill: "rgba(124,58,237,0.06)", radius: 6 } as React.SVGProps<SVGRectElement>}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="var(--color-primary,#7C3AED)"
                    strokeWidth={2.5}
                    fill="url(#enrollGrad)"
                    dot={{ fill: "var(--color-primary,#7C3AED)", strokeWidth: 0, r: 3 }}
                    activeDot={{ r: 5, fill: "var(--color-primary,#7C3AED)", strokeWidth: 2, stroke: "#fff" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <Card className="animate-slide-up" style={{ animationDelay: "280ms" } as React.CSSProperties}>
          <CardHeader className="pb-2">
            <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.recentActivity.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">No recent activity</p>
            )}
            {data.recentActivity.map((item, i) => (
              <div key={i} className="flex items-start gap-3 stagger-item group">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110"
                  style={{ background: item.type === "enrollment" ? "#EDE9FE" : "#D1FAE5" }}
                >
                  {item.type === "enrollment"
                    ? <Users className="h-3.5 w-3.5 text-violet-600" />
                    : <GraduationCap className="h-3.5 w-3.5 text-emerald-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{item.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{item.sub} · {formatDateTime(item.time)}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Per center cards */}
      {data.perCenter && data.perCenter.length > 0 && (
        <div className="animate-slide-up" style={{ animationDelay: "360ms" }}>
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-3">Centers</p>
          <div className="grid grid-cols-3 gap-4">
            {data.perCenter.map((c, idx) => (
              <div
                key={c.id}
                className={`relative rounded-2xl p-5 overflow-hidden text-white bg-gradient-to-br ${CARD_GRADIENTS[idx % CARD_GRADIENTS.length]} batch-card-hover shimmer-hover cursor-default animate-slide-up`}
                style={{ animationDelay: `${idx * 80 + 400}ms` }}
              >
                <div className="absolute -right-6 -bottom-6 opacity-10">
                  <Layers strokeWidth={1} className="h-28 w-28 animate-spin-slow" />
                </div>
                <p className="font-semibold text-sm mb-4">{c.name}</p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[["Students", c.students], ["Batches", c.batches], ["Enrolled", c.enrollments]].map(([l, v]) => (
                    <div key={l as string} className="bg-white/15 rounded-xl py-2.5 hover:bg-white/25 transition-colors">
                      <p className="text-lg font-bold">{v}</p>
                      <p className="text-[10px] text-white/70 mt-0.5">{l}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TeacherDashboard() {
  const { data, isLoading } = useQuery({ queryKey: ["teacher-dashboard"], queryFn: getTeacherDashboard });
  if (isLoading) return <DashboardSkeleton />;
  if (!data) return null;

  if (!data.linked) {
    return (
      <Card className="animate-scale-in">
        <CardContent className="py-16 text-center">
          <div className="h-16 w-16 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-violet-50 animate-float">
            <GraduationCap className="h-8 w-8 text-violet-400" />
          </div>
          <p className="font-semibold text-gray-800">Not linked to a faculty profile</p>
          <p className="text-sm text-gray-400 mt-1">Ask an admin to link your staff account.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="grid grid-cols-3 gap-4">
        <StatCard icon={Layers}   label="My Batches"     value={data.totalBatches}       countTo={data.totalBatches}       iconClass="bg-violet-100 text-violet-600"  delay={0} />
        <StatCard icon={Users}    label="Total Students" value={data.totalStudents}       countTo={data.totalStudents}       iconClass="bg-blue-100 text-blue-600"      delay={80} />
        <StatCard icon={Calendar} label="Classes Today"  value={data.classesToday.length} countTo={data.classesToday.length} iconClass="bg-emerald-100 text-emerald-600" delay={160} />
      </div>

      <div className="grid grid-cols-2 gap-5">
        <Card className="animate-slide-up" style={{ animationDelay: "200ms" } as React.CSSProperties}>
          <CardHeader className="pb-2">
            <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-gray-400">My Batches</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.myBatches.length === 0 && <p className="text-sm text-gray-400 text-center py-6">No active batches</p>}
            {data.myBatches.map((b) => (
              <div
                key={b.id}
                className="flex items-center gap-3 rounded-xl bg-violet-50 px-4 py-3 hover:bg-violet-100 transition-colors group stagger-item"
              >
                <div className="h-7 w-7 rounded-xl flex items-center justify-center bg-violet-100 group-hover:bg-violet-200 group-hover:scale-110 transition-all">
                  <Layers className="h-3.5 w-3.5 text-violet-600" />
                </div>
                <span className="text-sm text-gray-700 font-medium">{b.name}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="animate-slide-up" style={{ animationDelay: "280ms" } as React.CSSProperties}>
          <CardHeader className="pb-2">
            <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Today's Classes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.classesToday.length === 0 && <p className="text-sm text-gray-400 text-center py-6">No classes today</p>}
            {(data.classesToday as Array<{ id: string; startTime: string; endTime: string; status: string; batch?: { name: string } }>).map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3 hover:bg-gray-100 transition-colors stagger-item">
                <div className="h-7 w-7 rounded-xl flex items-center justify-center bg-emerald-100">
                  <Calendar className="h-3.5 w-3.5 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{s.startTime} – {s.endTime}</p>
                  {s.batch && <p className="text-xs text-gray-400">{s.batch.name}</p>}
                </div>
                <Badge variant={s.status === "completed" ? "success" : s.status === "cancelled" ? "danger" : "default"}>
                  {s.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div>
      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2"><Skeleton className="h-64 rounded-2xl" /></div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { staff, selectRole } = useAuth();
  const [switchingRole, setSwitchingRole] = useState(false);
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const dateStr = now.toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  // Which dashboard shows is driven entirely by staff.activeRole — a real,
  // server-enforced session property (see AuthContext/select-role), not a
  // local display toggle. Switching here changes what you can *do*
  // everywhere else in the app too, not just this screen's content.
  const showTeacherDashboard = staff?.activeRole === "teacher";

  async function handleSelectRole(role: "admin" | "teacher" | "frontdesk") {
    if (role === staff?.activeRole) return;
    setSwitchingRole(true);
    try { await selectRole(role); } finally { setSwitchingRole(false); }
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="bg-white px-7 py-5 animate-slide-up" style={{ borderBottom: "1px solid rgba(109,40,217,0.07)" }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {greeting},{" "}
              <span className="gradient-text">{staff?.fullName?.split(" ")[0]}</span> 👋
            </h1>
            <p className="text-sm text-gray-400 mt-0.5">{dateStr}</p>
          </div>
          <div className="flex items-center gap-3">
            {staff && staff.roles.length > 1 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    disabled={switchingRole}
                    className="flex items-center gap-2 rounded-xl border border-violet-100 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-100 transition-colors disabled:opacity-60"
                  >
                    <span className="capitalize">Acting as: {staff.activeRole}</span>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Switch role</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {staff.roles.map((r) => (
                    <DropdownMenuItem
                      key={r}
                      onClick={() => handleSelectRole(r)}
                      className={cn("capitalize", staff.activeRole === r && "font-semibold")}
                    >
                      {r}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-50 border border-violet-100">
              <div className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </div>
              <span className="text-xs font-semibold text-violet-600">Live</span>
            </div>
          </div>
        </div>
      </div>
      <div className="flex-1 p-7">
        {showTeacherDashboard ? <TeacherDashboard /> : <AdminDashboard />}
      </div>
    </div>
  );
}
