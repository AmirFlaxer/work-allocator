import { useState } from "react";
import { Employee, Station } from "@/types/employee";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d.toISOString().split("T")[0];
  });
}

export function WeeklyPreferences({
  employees,
  stations,
  weekStart,
  onUpdate,
}: WeeklyPreferencesProps) {
  const [selectedEmployee, setSelectedEmployee] = useState<string>("");
  const weekDays = getWeekDays(weekStart);

  const selectedEmp = employees.find(e => e.id === selectedEmployee);

  // FIX: if availableStations is empty → employee can work all stations
  const getSelectableStations = (emp: Employee): Station[] =>
    emp.availableStations.length === 0
      ? stations
      : stations.filter(s => emp.availableStations.includes(s.id));

  const handleUnavailableToggle = (date: string) => {
    if (!selectedEmp) return;
    const unavailable = selectedEmp.unavailableDays ?? [];
    onUpdate(selectedEmployee, {
      unavailableDays: unavailable.includes(date)
        ? unavailable.filter(d => d !== date)
        : [...unavailable, date],
    });
  };

  const handleSpecificRequest = (date: string, stationId: number) => {
    if (!selectedEmp) return;
    const req
