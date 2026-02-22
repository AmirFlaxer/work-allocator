import { Employee, Station, WeeklySchedule } from "@/types/employee";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, MapPin, CheckCircle2, AlertCircle, BarChart2 } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface DashboardProps {
  employees: Employee[];
  stations: Station[];
  schedule: WeeklySchedule | null;
}

function getBarColor(shifts: number, max: number): string {
  if (shifts === 0) return "#cbd5e1";
  const ratio = shifts / Math.max(max, 1);
  if (ratio <= 0.35) return "#22c55e";
  if (ratio <= 0.65) return "#eab308";
  return "#ef4444";
}

function calcWorkloads(schedule: WeeklySchedule): { [name: string]: number } {
  const wl: { [name: string]: number } = {};
  Object.values(schedule).forEach(day =>
    Object.values(day).forEach(name => {
      if (name) wl[name] = (wl[name] || 0) + 1;
    })
  );
  return wl;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload?.length) {
    const { fullName, משמרות } = payload[0].payload;
    return (
      <div className="bg-white border rounded-lg shadow-md px-3 py-2 text-sm">
        <p className="font-semibold">{fullName}</p>
        <p className="text-muted-foreground">{משמרות} משמרות השבוע</p>
      </div>
    );
  }
  return null;
};

export function Dashboard({ employees, stations, schedule }: DashboardProps) {
  const workloads = schedule ? calcWorkloads(schedule) : {};

  const totalSlots = schedule
    ? Object.values(schedule).reduce((acc, day) => acc + Object.keys(day).length, 0)
    : 0;
  const filledSlots = schedule
    ? Object.values(schedule).reduce(
        (acc, day) => acc + Object.values(day).filter(v => v !== "").length,
        0
      )
    : 0;
  const emptySlots = totalSlots - filledSlots;
  const fillPercent = totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 0;
  const starCount = employees.filter(e => e.hasStar).length;

  const chartData = employees.map(e => ({
    name: e.name.length > 7 ? e.name.slice(0, 7) + "…" : e.name,
    fullName: e.name,
    משמרות: workloads[e.name] || 0,
  }));
  const maxShifts = Math.max(...chartData.map(d => d.משמרות), 1);

  const statCards = [
    {
      label: "עובדים",
      value: employees.length,
      sub: `${starCount} עם ⭐`,
      icon: <Users className="h-4 w-4 text-blue-600" />,
      bg: "bg-blue-50",
    },
    {
      label: "עמדות",
      value: stations.length,
      sub: `${stations.length * 5} משבצות/שבוע`,
      icon: <MapPin className="h-4 w-4 text-purple-600" />,
      bg: "bg-purple-50",
    },
    {
      label: "מאויישות",
      value: filledSlots,
      sub: `${fillPercent}% מהסה"כ`,
      icon: <CheckCircle2 className="h-4 w-4 text-green-600" />,
      bg: "bg-green-50",
    },
    {
      label: "חסרות",
      value: emptySlots,
      sub: `מתוך ${totalSlots} משבצות`,
      icon: (
        <AlertCircle
          className={`h-4 w-4 ${emptySlots > 0 ? "text-red-600" : "text-green-600"}`}
        />
      ),
      bg: emptySlots > 0 ? "bg-red-50" : "bg-green-50",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {statCards.map(card => (
          <Card key={card.label} className="border-0 shadow-sm">
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-xl ${card.bg} flex-shrink-0`}>
                  {card.icon}
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground truncate">{card.label}</p>
                  <p className="text-2xl font-bold leading-tight">{card.value}</p>
                  <p className="text-xs text-muted-foreground truncate">{card.sub}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Workload chart */}
      {schedule && employees.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-muted-foreground" />
              עומס עובדים השבוע
              <div className="mr-auto flex items-center gap-3 text-xs font-normal text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                  נמוך
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />
                  בינוני
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                  גבוה
                </span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-3">
            <ResponsiveContainer width="100%" height={150}>
              <BarChart
                data={chartData}
                margin={{ top: 4, right: 12, left: -24, bottom: 0 }}
              >
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  content={<CustomTooltip />}
                  cursor={{ fill: "rgba(0,0,0,0.04)" }}
                />
                <Bar dataKey="משמרות" radius={[5, 5, 0, 0]} maxBarSize={40}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={getBarColor(entry.משמרות, maxShifts)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
