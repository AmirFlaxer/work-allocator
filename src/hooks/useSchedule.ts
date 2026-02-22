import { useState, useEffect } from "react";
import { Employee, Station, WeeklySchedule, SavedSchedule } from "@/types/employee";
import { generateWeeklySchedule } from "@/lib/scheduler";
import * as XLSX from "xlsx";
import { toPng } from "html-to-image";

function getNextSunday(date: Date): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + ((7 - result.getDay()) % 7));
  return result;
}

function getWeekDaysForExport(weekStart: Date): string[] {
  return Array.from({ length: 5 }, (_, i) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + i);
    return date.toISOString().split("T")[0];
  });
}

export function useSchedule() {
  const [schedule, setSchedule] = useState<WeeklySchedule | null>(() => {
    try {
      const saved = localStorage.getItem("schedule");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [weekStart, setWeekStart] = useState<Date>(() => {
    try {
      const saved = localStorage.getItem("weekStart");
      return saved ? new Date(saved) : getNextSunday(new Date());
    } catch {
      return getNextSunday(new Date());
    }
  });

  const [savedSchedules, setSavedSchedules] = useState<SavedSchedule[]>(() => {
    try {
      const saved = localStorage.getItem("savedSchedules");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [previousSchedule, setPreviousSchedule] = useState<WeeklySchedule | null>(null);

  useEffect(() => {
    if (schedule) localStorage.setItem("schedule", JSON.stringify(schedule));
  }, [schedule]);

  useEffect(() => {
    localStorage.setItem("weekStart", weekStart.toISOString());
  }, [weekStart]);

  useEffect(() => {
    localStorage.setItem("savedSchedules", JSON.stringify(savedSchedules));
  }, [savedSchedules]);

  const generate = (employees: Employee[], stations: Station[]): WeeklySchedule => {
    if (schedule) setPreviousSchedule(schedule);
    const newSchedule = generateWeeklySchedule(employees, stations, weekStart);
    setSchedule(newSchedule);
    return newSchedule;
  };

  const saveSchedule = (name: string): boolean => {
    if (!schedule || !name.trim()) return false;
    const entry: SavedSchedule = {
      id: Date.now().toString(),
      name: name.trim(),
      schedule,
      weekStart: weekStart.toISOString(),
      savedAt: new Date().toISOString(),
    };
    setSavedSchedules(prev => [...prev, entry]);
    return true;
  };

  const loadSchedule = (saved: SavedSchedule) => {
    setSchedule(saved.schedule);
    setWeekStart(new Date(saved.weekStart));
  };

  const deleteSavedSchedule = (id: string) => {
    setSavedSchedules(prev => prev.filter(s => s.id !== id));
  };

  const goToPreviousWeek = () => {
    setWeekStart(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 7);
      return d;
    });
  };

  const goToNextWeek = () => {
    setWeekStart(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 7);
      return d;
    });
  };

  const goToCurrentWeek = () => setWeekStart(getNextSunday(new Date()));

  const exportToExcel = (stations: Station[]): boolean => {
    if (!schedule) return false;
    try {
      const HEBREW_DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי"];
      const weekDays = getWeekDaysForExport(weekStart);
      const headers = [
        "עמדה",
        ...HEBREW_DAYS.map((day, idx) =>
          `${day} (${new Date(weekDays[idx]).toLocaleDateString("he-IL", {
            day: "2-digit",
            month: "2-digit",
          })})`
        ),
      ];
      const data = stations.map(station => [
        station.name,
        ...weekDays.map(date => schedule[date]?.[station.id] || "לא משובץ"),
      ]);
      const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "שיבוץ שבועי");
      const fileName = `שיבוץ_${weekStart.toLocaleDateString("he-IL").replace(/\//g, "-")}.xlsx`;
      XLSX.writeFile(wb, fileName);
      return true;
    } catch {
      return false;
    }
  };

  const exportToImage = async (): Promise<boolean> => {
    const el = document.getElementById("schedule-table");
    if (!el) return false;
    try {
      const dataUrl = await toPng(el, {
        quality: 1,
        pixelRatio: 2,
        backgroundColor: "#ffffff",
      });
      const link = document.createElement("a");
      link.download = `שיבוץ_${weekStart.toLocaleDateString("he-IL").replace(/\//g, "-")}.png`;
      link.href = dataUrl;
      link.click();
      return true;
    } catch {
      return false;
    }
  };

  return {
    schedule,
    weekStart,
    savedSchedules,
    previousSchedule,
    generate,
    saveSchedule,
    loadSchedule,
    deleteSavedSchedule,
    goToPreviousWeek,
    goToNextWeek,
    goToCurrentWeek,
    exportToExcel,
    exportToImage,
  };
}
