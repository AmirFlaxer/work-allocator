import { useState } from "react";
import { Employee, Station } from "@/types/employee";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

interface EmployeeFormProps {
  employee?: Employee;
  stations: Station[];
  onSave: (employee: Omit<Employee, "id"> & { id?: string }) => void;
  onCancel: () => void;
}

export function EmployeeForm({ employee, stations, onSave, onCancel }: EmployeeFormProps) {
  const [name, setName] = useState(employee?.name || "");
  const [hasStar, setHasStar] = useState(employee?.hasStar || false);
  const [minWeeklyShifts, setMinWeeklyShifts] = useState(employee?.minWeeklyShifts ?? 1);
  const [maxWeeklyShifts, setMaxWeeklyShifts] = useState<number | "">(
    employee?.maxWeeklyShifts ?? ""
  );
  const [canWorkMultipleStations, setCanWorkMultipleStations] = useState(
    employee?.canWorkMultipleStations ?? false
  );
  const [availableStations, setAvailableStations] = useState<number[]>(
    employee?.availableStations || []
  );
  const [notes, setNotes] = useState(employee?.notes || "");

  const handleStationToggle = (stationId: number) => {
    setAvailableStations(prev =>
      prev.includes(stationId)
        ? prev.filter(id => id !== stationId)
        : [...prev, stationId]
    );
  };

  const maxError =
    maxWeeklyShifts !== "" && maxWeeklyShifts < minWeeklyShifts
      ? "המקסימום חייב להיות גדול או שווה למינימום"
      : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || maxError) return;

    onSave({
      ...(employee?.id && { id: employee.id }),
      name: name.trim(),
      hasStar,
      minWeeklyShifts,
      maxWeeklyShifts: maxWeeklyShifts === "" ? undefined : maxWeeklyShifts,
      availableStations: availableStations.sort((a, b) => a - b),
      canWorkMultipleStations,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <Card className="p-6">
      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="name">שם העובד</Label>
          <Input
            id="name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="הכנס שם"
            required
          />
        </div>

        {/* Star */}
        <div className="flex items-center space-x-2 space-x-reverse">
          <Checkbox
            id="hasStar"
            checked={hasStar}
            onCheckedChange={checked => setHasStar(checked as boolean)}
          />
          <Label htmlFor="hasStar" className="cursor-pointer">
            עובד עם כוכב (עדיפות גבוהה)
          </Label>
        </div>

        {/* Multiple stations */}
        <div className="flex items-center space-x-2 space-x-reverse">
          <Checkbox
            id="canWorkMultiple"
            checked={canWorkMultipleStations}
            onCheckedChange={checked => setCanWorkMultipleStations(checked as boolean)}
          />
          <Label htmlFor="canWorkMultiple" className="cursor-pointer">
            אפשר שיבוץ למספר עמדות ביום
          </Label>
        </div>

        {/* Min / Max */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="minShifts">מינימום משמרות/שבוע</Label>
            <Input
              id="minShifts"
              type="number"
              min="0"
              max="5"
              value={minWeeklyShifts}
              onChange={e => setMinWeeklyShifts(parseInt(e.target.value) || 0)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="maxShifts">
              מקסימום משמרות/שבוע{" "}
              <span className="text-xs text-muted-foreground">(אופציונלי)</span>
            </Label>
            <Input
              id="maxShifts"
              type="number"
              min={minWeeklyShifts}
              max="5"
              value={maxWeeklyShifts}
              placeholder="ללא הגבלה"
              onChange={e =>
                setMaxWeeklyShifts(e.target.value === "" ? "" : parseInt(e.target.value))
              }
            />
            {maxError && <p className="text-xs text-red-500">{maxError}</p>}
          </div>
        </div>

        {/* Available stations */}
        <div className="space-y-2">
          <Label>עמדות זמינות</Label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {stations.map(station => (
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
            <p className="text-sm text-muted-foreground">אין עמדות זמינות. הוסף עמדות קודם.</p>
          )}
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <Label htmlFor="notes">
            הערות{" "}
            <span className="text-xs text-muted-foreground">(אופציונלי)</span>
          </Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="הערות חופשיות לגבי העובד..."
            rows={3}
            className="resize-none"
          />
        </div>

        {/* Buttons */}
        <div className="flex gap-2">
          <Button type="submit" disabled={!name.trim() || !!maxError}>
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
