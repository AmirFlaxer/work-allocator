import { useState } from "react";
import { Employee, Station } from "@/types/employee";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Calendar, X } from "lucide-react";
import { getWeekDays, getHebrewDayLabels, parseISODate } from "@/lib/week";

interface WeeklyPreferencesProps {
  employees: Employee[];
  stations: Station[];
  weekStart: Date;
  activeDays: number[];
  onUpdate: (employeeId: string, updates: Partial<Employee>) => void;
}

export function WeeklyPreferences({ employees, stations, weekStart, activeDays, onUpdate }: WeeklyPreferencesProps) {
  const [selectedEmployee, setSelectedEmployee] = useState<string>("");
  const weekDays = getWeekDays(weekStart, activeDays);
  const hebrewDays = getHebrewDayLabels(activeDays);
  const selectedEmp = employees.find(e => e.id === selectedEmployee);

  type DayState = "available" | "preferNot" | "unavailable";

  const dayState = (date: string): DayState =>
    selectedEmp?.unavailableDays?.includes(date) ? "unavailable"
    : selectedEmp?.preferNotDays?.includes(date) ? "preferNot"
    : "available";

  // מחזור לחיצות: זמין, ואז "מעדיף שלא", ואז "לא זמין", וחוזר.
  // מעבר מצב שומר שהיום לעולם לא נמצא בשתי הרשימות יחד.
  const handleDayCycle = (date: string) => {
    if (!selectedEmp) return;
    const unavailable = selectedEmp.unavailableDays ?? [];
    const preferNot   = selectedEmp.preferNotDays ?? [];
    const state = dayState(date);
    if (state === "available") {
      onUpdate(selectedEmployee, { preferNotDays: [...preferNot, date] });
    } else if (state === "preferNot") {
      onUpdate(selectedEmployee, {
        preferNotDays: preferNot.filter(d => d !== date),
        unavailableDays: [...unavailable, date],
      });
    } else {
      onUpdate(selectedEmployee, { unavailableDays: unavailable.filter(d => d !== date) });
    }
  };

  const handleSpecificRequest = (date: string, stationId: number) => {
    if (!selectedEmp) return;
    const requests = selectedEmp.specificRequests || [];
    const existing = requests.find(r => r.date === date);

    if (existing) {
      if (existing.stationId === stationId) {
        onUpdate(selectedEmployee, {
          specificRequests: requests.filter(r => r.date !== date),
        });
      } else {
        onUpdate(selectedEmployee, {
          specificRequests: requests.map(r =>
            r.date === date ? { date, stationId } : r
          ),
        });
      }
    } else {
      onUpdate(selectedEmployee, {
        specificRequests: [...requests, { date, stationId }],
      });
    }
  };

  const clearRequest = (date: string) => {
    if (!selectedEmp) return;
    onUpdate(selectedEmployee, {
      specificRequests: selectedEmp.specificRequests?.filter(r => r.date !== date),
    });
  };

  const availableStationsFor = (emp: Employee) =>
    (emp.availableStations?.length ?? 0) === 0
      ? stations
      : stations.filter(s => emp.availableStations.includes(s.id));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Calendar className="h-5 w-5 text-muted-foreground" />
        <div className="text-sm text-muted-foreground">
          שבוע: {parseISODate(weekDays[0]).toLocaleDateString("he-IL")} עד{" "}
          {parseISODate(weekDays[weekDays.length - 1]).toLocaleDateString("he-IL")}
        </div>
      </div>

      <div className="space-y-2">
        <Label>בחר עובד</Label>
        <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
          <SelectTrigger>
            <SelectValue placeholder="בחר עובד" />
          </SelectTrigger>
          <SelectContent>
            {employees.map(emp => (
              <SelectItem key={emp.id} value={emp.id}>
                {emp.name} {emp.hasStar && "⭐"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedEmp && (
        <Card className="p-6 space-y-6">

          {/* Summary badges */}
          <div className="flex flex-wrap gap-2">
            {selectedEmp.hasStar && (
              <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-300 dark:border-yellow-800">
                ⭐ עדיפות גבוהה
              </Badge>
            )}
            {(selectedEmp.unavailableDays?.length ?? 0) > 0 && (
              <Badge variant="secondary">
                {selectedEmp.unavailableDays!.length} ימים חסומים
              </Badge>
            )}
            {(selectedEmp.preferNotDays?.length ?? 0) > 0 && (
              <Badge variant="outline" className="border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300">
                {selectedEmp.preferNotDays!.length} ימי העדפה
              </Badge>
            )}
            {(selectedEmp.specificRequests?.length ?? 0) > 0 && (
              <Badge variant="outline">
                {selectedEmp.specificRequests!.length} בקשות שיבוץ
              </Badge>
            )}
            {selectedEmp.maxWeeklyShifts !== undefined && (
              <Badge variant="outline" className="border-orange-200 text-orange-700 dark:border-orange-800 dark:text-orange-300">
                מקס׳ {selectedEmp.maxWeeklyShifts} משמרות/שבוע
              </Badge>
            )}
          </div>

          {/* Day availability - three states */}
          <div className="space-y-3">
            <h3 className="font-semibold">זמינות ימים</h3>
            <p className="text-xs text-muted-foreground">
              לחיצה מחליפה מצב: זמין, אחר כך "מעדיף שלא", אחר כך "לא זמין"
            </p>
            <div className="space-y-2">
              {weekDays.map((date, idx) => {
                const state = dayState(date);
                return (
                  <div
                    key={date}
                    className={`flex items-center space-x-2 space-x-reverse rounded-md px-3 py-2 transition-colors ${
                      state === "unavailable"
                        ? "bg-red-50 border border-red-200 dark:bg-red-950/30 dark:border-red-900"
                        : state === "preferNot"
                        ? "bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-900"
                        : ""
                    }`}
                  >
                    <Checkbox
                      id={`day-state-${date}`}
                      checked={state === "unavailable" ? true : state === "preferNot" ? "indeterminate" : false}
                      onCheckedChange={() => handleDayCycle(date)}
                    />
                    <Label htmlFor={`day-state-${date}`} className="cursor-pointer flex-1">
                      {hebrewDays[idx]}{" "}
                      <span className="text-muted-foreground text-xs">
                        ({parseISODate(date).toLocaleDateString("he-IL")})
                      </span>
                    </Label>
                    {state === "unavailable" && (
                      <span className="text-xs text-red-500">לא זמין</span>
                    )}
                    {state === "preferNot" && (
                      <span className="text-xs text-amber-600 dark:text-amber-400">מעדיף שלא</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Specific requests */}
          <div className="space-y-3">
            <h3 className="font-semibold">
              בקשות שיבוץ ספציפיות{" "}
              <span className="text-xs font-normal text-muted-foreground">
                {selectedEmp.hasStar
                  ? "(עובד עם כוכב - יתקיים תמיד)"
                  : "(ינסה להתחשב, לא מובטח)"}
              </span>
            </h3>
            <div className="space-y-2">
              {weekDays.map((date, idx) => {
                const isUnavailable = selectedEmp.unavailableDays?.includes(date);
                const request = selectedEmp.specificRequests?.find(
                  r => r.date === date
                );
                const empStations = availableStationsFor(selectedEmp);

                return (
                  <div key={date} className="flex items-center gap-3">
                    <Label className="min-w-[110px] text-sm">
                      {hebrewDays[idx]}{" "}
                      <span className="text-xs text-muted-foreground">
                        (
                        {parseISODate(date).toLocaleDateString("he-IL", {
                          day: "2-digit",
                          month: "2-digit",
                        })}
                        )
                      </span>
                    </Label>

                    <Select
                      value={request?.stationId.toString() || ""}
                      disabled={isUnavailable}
                      onValueChange={value => {
                        if (value) handleSpecificRequest(date, parseInt(value));
                      }}
                    >
                      <SelectTrigger
                        className={`w-[200px] ${isUnavailable ? "opacity-50" : ""}`}
                      >
                        <SelectValue
                          placeholder={isUnavailable ? "לא זמין" : "בחר עמדה"}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {empStations.map(station => (
                          <SelectItem
                            key={station.id}
                            value={station.id.toString()}
                          >
                            {station.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {request && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => clearRequest(date)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
