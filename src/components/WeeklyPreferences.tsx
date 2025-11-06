import { useState } from "react";
import { Employee, Station } from "@/types/employee";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "lucide-react";

interface WeeklyPreferencesProps {
  employees: Employee[];
  stations: Station[];
  weekStart: Date;
  onUpdate: (employeeId: string, updates: Partial<Employee>) => void;
}

const HEBREW_DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי"];

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
        // Remove request
        onUpdate(selectedEmployee, {
          specificRequests: requests.filter(r => r.date !== date)
        });
      } else {
        // Update request
        onUpdate(selectedEmployee, {
          specificRequests: requests.map(r => 
            r.date === date ? { date, stationId } : r
          )
        });
      }
    } else {
      // Add new request
      onUpdate(selectedEmployee, {
        specificRequests: [...requests, { date, stationId }]
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Calendar className="h-5 w-5 text-muted-foreground" />
        <div className="text-sm text-muted-foreground">
          שבוע: {weekDays[0]} עד {weekDays[4]}
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
          <div className="space-y-4">
            <h3 className="font-semibold">ימים לא זמינים</h3>
            <div className="space-y-2">
              {weekDays.map((date, idx) => (
                <div key={date} className="flex items-center space-x-2 space-x-reverse">
                  <Checkbox
                    id={`unavailable-${date}`}
                    checked={selectedEmp.unavailableDays?.includes(date) || false}
                    onCheckedChange={() => handleUnavailableToggle(date)}
                  />
                  <Label htmlFor={`unavailable-${date}`} className="cursor-pointer">
                    {HEBREW_DAYS[idx]} ({new Date(date).toLocaleDateString('he-IL')})
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {selectedEmp.hasStar && (
            <div className="space-y-4">
              <h3 className="font-semibold">בקשות שיבוץ ספציפיות (עובד עם כוכב)</h3>
              <div className="space-y-3">
                {weekDays.map((date, idx) => {
                  const request = selectedEmp.specificRequests?.find(r => r.date === date);
                  return (
                    <div key={date} className="flex items-center gap-3">
                      <Label className="min-w-[120px]">
                        {HEBREW_DAYS[idx]} ({new Date(date).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })})
                      </Label>
                      <Select
                        value={request?.stationId.toString() || ""}
                        onValueChange={(value) => {
                          if (value) {
                            handleSpecificRequest(date, parseInt(value));
                          }
                        }}
                      >
                        <SelectTrigger className="w-[200px]">
                          <SelectValue placeholder="בחר עמדה" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">ללא בקשה</SelectItem>
                          {selectedEmp.availableStations.map(stationId => {
                            const station = stations.find(s => s.id === stationId);
                            return station ? (
                              <SelectItem key={stationId} value={stationId.toString()}>
                                {station.name}
                              </SelectItem>
                            ) : null;
                          })}
                        </SelectContent>
                      </Select>
                      {request && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            onUpdate(selectedEmployee, {
                              specificRequests: selectedEmp.specificRequests?.filter(r => r.date !== date)
                            });
                          }}
                        >
                          נקה
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function getWeekDays(weekStart: Date): string[] {
  const days: string[] = [];
  for (let i = 0; i < 5; i++) {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + i);
    days.push(date.toISOString().split('T')[0]);
  }
  return days;
}
