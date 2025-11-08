import { WeeklySchedule, Station } from "@/types/employee";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, TrendingUp } from "lucide-react";

interface ScheduleChangesProps {
  currentSchedule: WeeklySchedule;
  previousSchedule: WeeklySchedule | null;
  stations: Station[];
  currentWeekStart: Date;
}

interface Change {
  date: string;
  stationName: string;
  previousEmployee: string;
  currentEmployee: string;
}

export function ScheduleChanges({ currentSchedule, previousSchedule, stations, currentWeekStart }: ScheduleChangesProps) {
  if (!previousSchedule) {
    return null;
  }

  const changes: Change[] = [];

  Object.keys(currentSchedule).forEach((date) => {
    stations.forEach((station) => {
      const currentEmp = currentSchedule[date]?.[station.id] || "";
      const previousEmp = previousSchedule[date]?.[station.id] || "";
      
      if (currentEmp !== previousEmp) {
        changes.push({
          date,
          stationName: station.name,
          previousEmployee: previousEmp || "לא משובץ",
          currentEmployee: currentEmp || "לא משובץ",
        });
      }
    });
  });

  if (changes.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="h-5 w-5" />
            השוואה לשבוע הקודם
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-4">
            אין שינויים משבוע קודם
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <TrendingUp className="h-5 w-5" />
          השוואה לשבוע הקודם
        </CardTitle>
        <CardDescription>
          נמצאו {changes.length} שינויים בשיבוץ
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {changes.map((change, idx) => (
            <div
              key={idx}
              className="flex items-center gap-3 p-3 border rounded-lg bg-accent/30"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-xs">
                    {new Date(change.date).toLocaleDateString('he-IL', { 
                      weekday: 'long', 
                      day: '2-digit', 
                      month: '2-digit' 
                    })}
                  </Badge>
                  <span className="font-medium">{change.stationName}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant="secondary">{change.previousEmployee}</Badge>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <Badge variant="default">{change.currentEmployee}</Badge>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}