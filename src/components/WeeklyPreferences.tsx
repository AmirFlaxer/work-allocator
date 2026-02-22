import { useState } from "react";
import { Employee, Station } from "@/types/employee";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Calendar, X } from "lucide-react";

interface WeeklyPreferencesProps {
  employees: Employee[];
  stations: Station[];
  weekStart: Date;
  onUpdate: (employeeId: string, updates: Partial<Employee>) => void;
}

const HEBREW_DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי"];

function getWeekDays(weekStart: Date): string[] {
  return Array.from({ length: 5 }, (_, i) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + i);
    return date.toISOString().split("T")[0];
  });
}

export function WeeklyPreferences({ employees, stations, weekStart, onUpdate }: WeeklyPreferencesProps) {
  const [selectedEmployee, setSelectedEmployee] = useState<string>("");
  const weekDays = getWeekDays(weekStart);
  const selectedEmp = employees.find(e => e.id === selectedEmployee);

  const handleUnavailableToggle = (date: string) => {
    if (!selectedEmp) return;
    const unavailable = selectedEmp.unavailableDays || [];
    const updated = unavailable.includes(date)
      ? unavailable.filter(d => d !== date)
      : [...unavailable, date];
    onUpdate(selectedEmployee, { unavailableDays: updated });
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
          שבוע: {new Date(weekDays[0]).toLocaleDateString("he-IL")} עד{" "}
          {new Date(weekDays[4]).toLocaleDateString("he-IL")}
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
              <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">
                ⭐ עדיפות גבוהה
              </Badge>
            )}
            {(selectedEmp.unavailableDays?.length ?? 0) > 0 && (
              <Badge variant="secondary">
                {selectedEmp.unavailableDays!.length} ימים חסומים
              </Badge>
            )}
            {(selectedEmp.specificRequests?.length ?? 0) > 0 && (
              <Badge variant="outline">
                {selectedEmp.specificRequests!.length} בקשות שיבוץ
              </Badge>
            )}
            {selectedEmp.maxWeeklyShifts !== undefined && (
              <Badge variant="outline" className="border-orange-200 text-orange-700">
                מקס׳ {selectedEmp.maxWeeklyShifts} משמרות/שבוע
              </Badge>
            )}
          </div>

          {/* Unavailable days */}
          <div className="space-y-3">
            <h3 className="font-semibold">ימים לא זמינים</h3>
            <div className="space-y-2">
              {weekDays.map((date, idx) => {
                const isUnavailable = selectedEmp.unavailableDays?.includes(date);
                return (
                  <div
                    key={date}
                    className={`flex items-center space-x-2 space-x-reverse rounded-md px-3 py-2 transition-colors ${
                      isUnavailable ? "bg-red-50 border border-red-200" : ""
                    }`}
                  >
                    <Checkbox
                      id={`unavailable-${date}`}
                      checked={isUnavailable || false}
                      onCheckedChange={() => handleUnavailableToggle(date)}
                    />
                    <Label
                      htmlFor={`unavailable-${date}`}
                      className="cursor-pointer flex-1"
                    >
                      {HEBREW_DAYS[idx]}{" "}
                      <span className="text-muted-foreground text-xs">
                        ({new Date(date).toLocaleDateString("he-IL")})
                      </span>
                    </Label>
                    {isUnavailable && (
                      <span className="text-xs text-red-500">לא זמין</span>
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
                  ? "(עובד עם כוכב — יתקיים תמיד)"
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
                      {HEBREW_DAYS[idx]}{" "}
                      <span className="text-xs text-muted-foreground">
                        (
                        {new Date(date).toLocaleDateString("he-IL", {
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
