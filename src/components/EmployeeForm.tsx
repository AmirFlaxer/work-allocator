import { useState } from "react";
import { Employee, Station } from "@/types/employee";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";

interface EmployeeFormProps {
  employee?: Employee;
  stations: Station[];
  onSave: (employee: Omit<Employee, "id"> & { id?: string }) => void;
  onCancel: () => void;
}

export function EmployeeForm({ employee, stations, onSave, onCancel }: EmployeeFormProps) {
  const [name, setName] = useState(employee?.name || "");
  const [hasStar, setHasStar] = useState(employee?.hasStar || false);
  const [minWeeklyShifts, setMinWeeklyShifts] = useState(employee?.minWeeklyShifts || 1);
  const [availableStations, setAvailableStations] = useState<number[]>(
    employee?.availableStations || []
  );

  const handleStationToggle = (stationId: number) => {
    setAvailableStations((prev) =>
      prev.includes(stationId)
        ? prev.filter((id) => id !== stationId)
        : [...prev, stationId]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || availableStations.length === 0) return;

    onSave({
      ...(employee?.id && { id: employee.id }),
      name: name.trim(),
      hasStar,
      minWeeklyShifts,
      availableStations: availableStations.sort((a, b) => a - b),
    });
  };

  return (
    <Card className="p-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="name">שם העובד</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="הכנס שם"
            required
          />
        </div>

        <div className="flex items-center space-x-2 space-x-reverse">
          <Checkbox
            id="hasStar"
            checked={hasStar}
            onCheckedChange={(checked) => setHasStar(checked as boolean)}
          />
          <Label htmlFor="hasStar" className="cursor-pointer">
            עובד עם כוכב (עדיפות גבוהה)
          </Label>
        </div>

        <div className="space-y-2">
          <Label htmlFor="minShifts">מינימום שיבוצים שבועיים</Label>
          <Input
            id="minShifts"
            type="number"
            min="0"
            max="5"
            value={minWeeklyShifts}
            onChange={(e) => setMinWeeklyShifts(parseInt(e.target.value))}
            required
          />
        </div>

        <div className="space-y-2">
          <Label>עמדות זמינות</Label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {stations.map((station) => (
              <div key={station.id} className="flex items-center space-x-2 space-x-reverse">
                <Checkbox
                  id={`station-${station.id}`}
                  checked={availableStations.includes(station.id)}
                  onCheckedChange={() => handleStationToggle(station.id)}
                />
                <Label htmlFor={`station-${station.id}`} className="cursor-pointer">
                  {station.name}
                </Label>
              </div>
            ))}
          </div>
          {stations.length === 0 && (
            <p className="text-sm text-muted-foreground">
              אין עמדות זמינות. הוסף עמדות קודם.
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <Button type="submit" disabled={!name.trim() || availableStations.length === 0}>
            {employee ? "עדכן" : "הוסף"}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            ביטול
          </Button>
        </div>
      </form>
    </Card>
  );
}
