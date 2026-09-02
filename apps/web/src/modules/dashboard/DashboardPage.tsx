import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Users, Layers, GraduationCap, TrendingUp,
  IndianRupee, Calendar, ArrowUpRight, ArrowRight, ChevronDown,
  Bell, AlertTriangle, Clock, FileText, UserPlus, UserX, Wallet,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/context/AuthContext";
import { getDashboardStats, getTeacherDashboard, type DashboardStats } from "@/api/dashboard";
import { getUnreadCount } from "@/api/notifications";
import { cn, formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
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
  // Month-over-month context shown under the label — additional to `sub`
  // (which stays reserved for the top-right badge, e.g. "N total").
  trend?: string;
  iconClass: string;
  countTo?: number;
  delay?: number;
  onClick?: () => void;
}

function StatCard({ icon: Icon, label, value, sub, trend, iconClass, countTo, delay = 0, onClick }: StatCardProps) {
  const counted = useCountUp(countTo ?? 0, 1100);
  const displayValue = countTo !== undefined ? counted.toLocaleString() : value;
  const Wrapper = onClick ? "button" : "div";

  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`w-full text-left bg-white rounded-2xl p-5 border border-purple-50 shadow-stat card-hover shimmer-hover animate-slide-up ${onClick ? "cursor-pointer hover:scale-[1.02] transition-transform" : "cursor-default"}`}
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
      <div className="flex items-center justify-between mt-0.5">
        <p className="text-sm text-gray-400">{label}</p>
        {trend && <span className="text-[11px] font-semibold text-emerald-600 shrink-0">{trend}</span>}
      </div>
    </Wrapper>
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

// ── Today — brand-colored hero card, matching the mobile app's "Today's
// Summary" banner: solid brand fill, glass stat chips, and the "needs
// attention" alerts folded into the same card rather than a separate one
// below it (mobile's own reasoning: two "what's happening today" cards
// sitting stacked with a gap between them read as disconnected). null means
// "nobody has marked attendance yet today" — distinct from a real zero, per
// dashboard.routes.ts's comment on studentsAbsentToday/facultyAbsentToday.
function TodayCard({ data, navigate }: { data: DashboardStats; navigate: (path: string) => void }) {
  const stats = [
    { label: "New Admissions",  value: data.admissionsToday,                                              icon: UserPlus },
    { label: "Fees Collected",  value: formatCurrency(data.feesCollectedToday),                            icon: Wallet },
    { label: "Students Absent", value: data.studentsAbsentToday === null ? "—" : data.studentsAbsentToday, icon: UserX },
    { label: "Faculty Absent",  value: data.facultyAbsentToday === null ? "—" : data.facultyAbsentToday,   icon: UserX },
  ];
  const alerts = [
    { label: "fee(s) overdue",              count: data.overdueFeesCount,         icon: AlertTriangle, to: "/fees?status=overdue" },
    { label: "lead(s) untouched 48h+",      count: data.staleLeadsCount,          icon: Clock,         to: "/leads?status=new" },
    { label: "application(s) pending",      count: data.pendingApplicationsCount, icon: FileText,      to: "/admission-applications?status=pending" },
  ];
  const allCaughtUp = alerts.every((a) => a.count === 0);

  return (
    <div
      className="relative overflow-hidden rounded-2xl p-6"
      style={{ background: "var(--color-primary,#7C3AED)" }}
    >
      {/* Darkens the flat brand fill toward the bottom-right, same intent as
          mobile's darken(colors.primary, 0.04) — an overlay instead of a JS
          color-math util, since this only needs to work in CSS here. */}
      <div className="absolute inset-0 bg-gradient-to-br from-black/0 via-black/5 to-black/25" />
      <GraduationCap className="absolute -right-6 -bottom-8 h-44 w-44 text-white/10" strokeWidth={1} />

      <div className="relative">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-white" />
          <h2 className="text-sm font-bold text-white">Today's Summary</h2>
        </div>
        <p className="text-xs text-white/70 mt-0.5">Here's what's happening at your institute today</p>

        <div className="grid grid-cols-4 gap-3 mt-4">
          {stats.map((it) => (
            <div key={it.label} className="rounded-xl bg-black/20 border border-white/10 px-3 py-3 text-center">
              <p className="text-lg font-bold text-white tabular-nums truncate">{it.value}</p>
              <p className="text-[10px] text-white/70 mt-0.5 leading-tight">{it.label}</p>
            </div>
          ))}
        </div>

        <div className="h-px bg-white/15 my-4" />

        <div className="flex items-center gap-2 mb-2.5">
          {!allCaughtUp && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/90">
              <AlertTriangle className="h-3 w-3 text-red-600" />
            </span>
          )}
          <h3 className="text-sm font-bold text-white">Today at a glance</h3>
        </div>

        {allCaughtUp ? (
          <p className="text-xs text-white/70">All caught up — nothing overdue or waiting.</p>
        ) : (
          <div className="space-y-2">
            {alerts.filter((a) => a.count > 0).map((a) => (
              <button
                key={a.label}
                onClick={() => navigate(a.to)}
                className="w-full flex items-center gap-3 rounded-xl bg-black/15 border border-white/10 px-3 py-2.5 hover:bg-black/25 transition-colors text-left"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/90">
                  <a.icon className="h-3.5 w-3.5 text-gray-700" />
                </span>
                <span className="flex-1 text-sm font-medium text-white">{a.count} {a.label}</span>
                <ArrowRight className="h-4 w-4 text-white/70 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Today's classes ──────────────────────────────────────────────────────────────
function TodaysClassesCard({ data, navigate }: { data: DashboardStats; navigate: (path: string) => void }) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Today's Classes</CardTitle>
        <Badge variant="default">{data.todaySessionsCount}</Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.todaySessions.length === 0 && <p className="text-sm text-gray-400 text-center py-6">No classes today</p>}
        {data.todaySessions.map((s) => (
          <button
            key={s.id}
            onClick={() => navigate(`/batches/${s.batchId}`)}
            className="w-full flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3 hover:bg-gray-100 transition-colors text-left"
          >
            <div className="h-8 w-8 rounded-xl flex items-center justify-center bg-emerald-100 shrink-0">
              <Calendar className="h-3.5 w-3.5 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{s.subjectName ?? "Class"} · {s.batchName}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {s.startTime}–{s.endTime}{s.facultyName ? ` · ${s.facultyName}` : ""}
              </p>
            </div>
          </button>
        ))}
        {data.todaySessionsCount > data.todaySessions.length && (
          <p className="text-xs text-gray-400 text-center pt-1">+{data.todaySessionsCount - data.todaySessions.length} more</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Pending fees ──────────────────────────────────────────────────────────────────
function PendingFeesCard({ data, navigate }: { data: DashboardStats; navigate: (path: string) => void }) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Pending Fees</CardTitle>
        {data.overdueFeesCount > 0 && <Badge variant="danger">{data.overdueFeesCount} overdue</Badge>}
      </CardHeader>
      <CardContent className="space-y-2">
        {data.topOverdueFees.length === 0 && <p className="text-sm text-gray-400 text-center py-6">No overdue fees</p>}
        {data.topOverdueFees.map((f) => (
          <button
            key={f.enrollmentId}
            onClick={() => navigate(`/fees/${f.enrollmentId}`)}
            className="w-full flex items-center justify-between gap-3 rounded-xl bg-red-50/60 px-4 py-3 hover:bg-red-50 transition-colors text-left"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{f.studentName}</p>
              <p className="text-xs text-gray-400 mt-0.5">Due {formatDate(f.dueDate)}</p>
            </div>
            <p className="text-sm font-bold text-red-600 shrink-0">{formatCurrency(f.outstanding)}</p>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}

// ── Admissions ────────────────────────────────────────────────────────────────────
const APPLICATION_BADGE: Record<string, BadgeProps["variant"]> = {
  pending: "info", admitted: "success", rejected: "danger",
};

function AdmissionsCard({ data, navigate }: { data: DashboardStats; navigate: (path: string) => void }) {
  const { pending, admitted, rejected } = data.applicationStatusCounts;
  const breakdown: { label: string; count: number; status: string }[] = [
    { label: "Pending",  count: pending,  status: "pending" },
    { label: "Admitted", count: admitted, status: "admitted" },
    { label: "Rejected", count: rejected, status: "rejected" },
  ];
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Admissions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {breakdown.map((b) => (
            <button
              key={b.label}
              onClick={() => navigate(`/admission-applications?status=${b.status}`)}
              className="rounded-xl bg-gray-50 hover:bg-gray-100 py-3 text-center transition-colors"
            >
              <p className="text-lg font-bold text-gray-900">{b.count}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{b.label}</p>
            </button>
          ))}
        </div>
        <div className="space-y-1">
          {data.recentAdmissions.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No recent applications</p>}
          {data.recentAdmissions.map((a) => (
            <button
              key={a.id}
              onClick={() => navigate(`/admission-applications?status=${a.status}`)}
              className="w-full flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-gray-50 transition-colors text-left"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{a.fullName}</p>
                <p className="text-xs text-gray-400 truncate">{a.courseName} · {formatDateTime(a.createdAt)}</p>
              </div>
              <Badge variant={APPLICATION_BADGE[a.status]} className="capitalize shrink-0">{a.status}</Badge>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function AdminDashboard() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: getDashboardStats });
  if (isLoading) return <DashboardSkeleton />;
  if (!data) return null;

  const feesTrend = data.feesTrendPercent !== null
    ? `${data.feesTrendPercent >= 0 ? "+" : ""}${data.feesTrendPercent}% vs last month`
    : data.feesTrendUpFromZero
      ? "New this month"
      : undefined;
  const batchesTrend = data.newBatchesThisMonth > 0 ? `+${data.newBatchesThisMonth} new` : undefined;
  const enrollmentsTrend = data.enrollmentsThisMonth > 0 ? `+${data.enrollmentsThisMonth} this month` : undefined;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Overview — the headline numbers, the one thing on this page that
          gets the large-tile treatment. */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard icon={Users}         label="Total Students"     value={data.totalStudents.toLocaleString()} countTo={data.totalStudents}  iconClass="bg-violet-100 text-violet-600" delay={0}   onClick={() => navigate("/students")} />
        <StatCard icon={Layers}        label="Active Batches"     value={data.activeBatches}                  countTo={data.activeBatches}   sub={`${data.totalBatches} total`} trend={batchesTrend} iconClass="bg-blue-100 text-blue-600" delay={80}  onClick={() => navigate("/batches")} />
        <StatCard icon={GraduationCap} label="Faculty"            value={data.totalFaculty}                   countTo={data.totalFaculty}    iconClass="bg-emerald-100 text-emerald-600" delay={160} onClick={() => navigate("/faculty")} />
        <StatCard icon={IndianRupee}   label="Fees Collected"     value={formatCurrency(data.feesCollected)}  trend={feesTrend}              iconClass="bg-amber-100 text-amber-600" delay={240} onClick={() => navigate("/fees?tab=collection")} />
      </div>

      {/* Today */}
      <TodayCard data={data} navigate={navigate} />

      {/* Schedule & fees */}
      <div className="grid grid-cols-2 gap-5">
        <TodaysClassesCard data={data} navigate={navigate} />
        <PendingFeesCard data={data} navigate={navigate} />
      </div>

      {/* Admissions & recent activity */}
      <div className="grid grid-cols-2 gap-5">
        <AdmissionsCard data={data} navigate={navigate} />

        <Card>
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

      {/* Growth */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Monthly Enrollments</CardTitle>
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <TrendingUp className="h-3.5 w-3.5 text-orange-500" />
            <span className="font-semibold text-gray-700">{data.totalEnrollments.toLocaleString()}</span> active
            {enrollmentsTrend && <span className="font-semibold text-emerald-600">· {enrollmentsTrend}</span>}
          </div>
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

      {/* Centers */}
      {data.perCenter && data.perCenter.length > 0 && (
        <div className="animate-slide-up" style={{ animationDelay: "360ms" }}>
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-3">Centers</p>
          <div className="grid grid-cols-3 gap-4">
            {data.perCenter.map((c, idx) => (
              <button
                key={c.id}
                type="button"
                onClick={() => navigate(`/centers/${c.id}`)}
                className={`relative rounded-2xl p-5 overflow-hidden text-white bg-gradient-to-br ${CARD_GRADIENTS[idx % CARD_GRADIENTS.length]} batch-card-hover shimmer-hover cursor-pointer text-left animate-slide-up`}
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
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TeacherDashboard() {
  const navigate = useNavigate();
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
        <StatCard icon={Layers}   label="My Batches"     value={data.totalBatches}       countTo={data.totalBatches}       iconClass="bg-violet-100 text-violet-600"  delay={0}   onClick={() => navigate("/batches")} />
        <StatCard icon={Users}    label="Total Students" value={data.totalStudents}       countTo={data.totalStudents}       iconClass="bg-blue-100 text-blue-600"      delay={80}  onClick={() => navigate("/students")} />
        <StatCard icon={Calendar} label="Classes Today"  value={data.classesToday.length} countTo={data.classesToday.length} iconClass="bg-emerald-100 text-emerald-600" delay={160} onClick={() => navigate("/schedule")} />
      </div>

      <div className="grid grid-cols-2 gap-5">
        <Card className="animate-slide-up" style={{ animationDelay: "200ms" } as React.CSSProperties}>
          <CardHeader className="pb-2">
            <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-gray-400">My Batches</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.myBatches.length === 0 && <p className="text-sm text-gray-400 text-center py-6">No active batches</p>}
            {data.myBatches.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => navigate(`/batches/${b.id}`)}
                className="w-full flex items-center gap-3 rounded-xl bg-violet-50 px-4 py-3 hover:bg-violet-100 transition-colors group stagger-item text-left"
              >
                <div className="h-7 w-7 rounded-xl flex items-center justify-center bg-violet-100 group-hover:bg-violet-200 group-hover:scale-110 transition-all">
                  <Layers className="h-3.5 w-3.5 text-violet-600" />
                </div>
                <span className="text-sm text-gray-700 font-medium">{b.name}</span>
              </button>
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
  const navigate = useNavigate();
  const { staff, selectRole } = useAuth();
  const [switchingRole, setSwitchingRole] = useState(false);
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const dateStr = now.toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const { data: unread } = useQuery({ queryKey: ["notifications-unread"], queryFn: getUnreadCount });

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
            <button
              type="button"
              onClick={() => navigate("/notifications")}
              className="relative flex items-center justify-center h-10 w-10 rounded-xl bg-violet-50 border border-violet-100 hover:bg-violet-100 transition-colors"
              title="Notifications"
            >
              <Bell className="h-4 w-4 text-violet-600" />
              {!!unread?.count && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {unread.count > 9 ? "9+" : unread.count}
                </span>
              )}
            </button>
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
