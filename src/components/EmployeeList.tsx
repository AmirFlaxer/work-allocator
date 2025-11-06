import { Employee } from "@/types/employee";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star, Pencil, Trash2 } from "lucide-react";

interface EmployeeListProps {
  employees: Employee[];
  onEdit: (employee: Employee) => void;
  onDelete: (id: string) => void;
}

export function EmployeeList({ employees, onEdit, onDelete }: EmployeeListProps) {
  if (employees.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-muted-foreground">לא נמצאו עובדים. הוסף עובד חדש להתחלה.</p>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {employees.map((employee) => (
        <Card key={employee.id} className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-lg">{employee.name}</h3>
              {employee.hasStar && (
                <Star className="h-4 w-4 fill-warning text-warning" />
              )}
            </div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onEdit(employee)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDelete(employee.id)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
          
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">עמדות זמינות: </span>
              <div className="flex flex-wrap gap-1 mt-1">
                {employee.availableStations.map((station) => (
                  <Badge key={station} variant="secondary">
                    {station}
                  </Badge>
                ))}
              </div>
            </div>
            
            <div>
              <span className="text-muted-foreground">מינימום שיבוצים שבועיים: </span>
              <span className="font-medium">{employee.minWeeklyShifts}</span>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
