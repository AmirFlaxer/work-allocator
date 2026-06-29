import { Employee, Station, WeeklySchedule } from "@/types/employee";
import { getWeekDays, cellNames, stationSlots, cellKey } from "@/lib/week";

export function generateWeeklySchedule(
  employees: Employee[],
  stations: Station[],
  weekStart: Date,
  activeDays: number[],
  baseSchedule?: WeeklySchedule,
  lockedCells?: Set<string>
): WeeklySchedule {
  const schedule: WeeklySchedule = {};
  const weekDays = getWeekDays(weekStart, activeDays);

  // Initialize slot arrays - preserve locked slots from baseSchedule.
  weekDays.forEach(date => {
    schedule[date] = {};
    stations.forEach(station => {
      const n = stationSlots(station);
      const base = cellNames(baseSchedule?.[date]?.[station.id]);
      const arr: string[] = [];
      for (let i = 0; i < n; i++) {
        const locked = lockedCells?.has(cellKey(date, station.id, i)) && base[i];
        arr[i] = locked ? base[i] : "";
      }
      schedule[date][station.id] = arr;
    });
  });

  const slotArr = (date: string, stationId: number) => schedule[date][stationId] as string[];

  // Track one-shift-per-day per employee.
  const employeeAssignments: { [employeeId: string]: { [date: string]: boolean } } = {};
  employees.forEach(emp => {
    employeeAssignments[emp.id] = {};
    weekDays.forEach(date => {
      employeeAssignments[emp.id][date] = stations.some(st =>
        slotArr(date, st.id).includes(emp.name)
      );
    });
  });

  const availableStationsFor = (emp: Employee) =>
    (emp.availableStations?.length ?? 0) === 0
      ? stations.map(s => s.id)
      : emp.availableStations;

  const getAssignedCount = (empId: string) =>
    Object.values(employeeAssignments[empId]).filter(Boolean).length;

  const reachedMax = (emp: Employee) => {
    if (emp.maxWeeklyShifts === undefined || emp.maxWeeklyShifts === null) return false;
    return getAssignedCount(emp.id) >= emp.maxWeeklyShifts;
  };

  // First free (empty, unlocked) slot index of a station on a date, or -1.
  const freeSlot = (date: string, stationId: number) => {
    const arr = slotArr(date, stationId);
    for (let i = 0; i < arr.length; i++) {
      if (!arr[i] && !lockedCells?.has(cellKey(date, stationId, i))) return i;
    }
    return -1;
  };

  const place = (date: string, stationId: number, emp: Employee) => {
    const slot = freeSlot(date, stationId);
    if (slot < 0) return false;
    slotArr(date, stationId)[slot] = emp.name;
    employeeAssignments[emp.id][date] = true;
    return true;
  };

  // Pass 1: Specific requests for starred employees.
  employees.filter(emp => emp.hasStar).forEach(employee => {
    employee.specificRequests?.forEach(request => {
      if (
        weekDays.includes(request.date) &&
        !employee.unavailableDays?.includes(request.date) &&
        availableStationsFor(employee).includes(request.stationId) &&
        freeSlot(request.date, request.stationId) >= 0 &&
        !reachedMax(employee)
      ) {
        place(request.date, request.stationId, employee);
      }
    });
  });

  // Pass 2: Fill with starred employees (by minWeeklyShifts desc), one shift/day.
  employees
    .filter(emp => emp.hasStar)
    .sort((a, b) => b.minWeeklyShifts - a.minWeeklyShifts)
    .forEach(employee => {
      let assignedCount = getAssignedCount(employee.id);
      for (const date of weekDays) {
        if (assignedCount >= employee.minWeeklyShifts) break;
        if (reachedMax(employee)) break;
        if (employee.unavailableDays?.includes(date)) continue;
        if (employeeAssignments[employee.id][date]) continue;
        for (const stationId of availableStationsFor(employee)) {
          if (place(date, stationId, employee)) { assignedCount++; break; }
        }
      }
    });

  // Pass 3: Specific requests for non-starred employees.
  employees.filter(emp => !emp.hasStar).forEach(employee => {
    employee.specificRequests?.forEach(request => {
      if (
        weekDays.includes(request.date) &&
        !employee.unavailableDays?.includes(request.date) &&
        availableStationsFor(employee).includes(request.stationId) &&
        !employeeAssignments[employee.id][request.date] &&
        freeSlot(request.date, request.stationId) >= 0 &&
        !reachedMax(employee)
      ) {
        place(request.date, request.stationId, employee);
      }
    });
  });

  // Pass 4: Fill with non-starred employees (one per day).
  employees.filter(emp => !emp.hasStar).forEach(employee => {
    for (const date of weekDays) {
      if (employeeAssignments[employee.id][date]) continue;
      if (employee.unavailableDays?.includes(date)) continue;
      if (reachedMax(employee)) break;
      for (const stationId of availableStationsFor(employee)) {
        if (place(date, stationId, employee)) break;
      }
    }
  });

  // Pass 5: Second round for remaining empty slots.
  weekDays.forEach(date => {
    stations.forEach(station => {
      while (freeSlot(date, station.id) >= 0) {
        const candidate = employees.filter(emp => !emp.hasStar).find(emp =>
          availableStationsFor(emp).includes(station.id) &&
          !employeeAssignments[emp.id][date] &&
          !emp.unavailableDays?.includes(date) &&
          !reachedMax(emp)
        );
        if (!candidate) break;
        place(date, station.id, candidate);
      }
    });
  });

  // Pass 6: Last resort - allow multiple stations/day.
  weekDays.forEach(date => {
    stations.forEach(station => {
      while (freeSlot(date, station.id) >= 0) {
        const multi = employees.find(emp =>
          availableStationsFor(emp).includes(station.id) &&
          emp.canWorkMultipleStations === true &&
          !emp.unavailableDays?.includes(date) &&
          !reachedMax(emp) &&
          !slotArr(date, station.id).includes(emp.name)
        );
        if (!multi) break;
        const slot = freeSlot(date, station.id);
        slotArr(date, station.id)[slot] = multi.name;
      }
    });
  });

  return schedule;
}

export function countFilledSlots(schedule: WeeklySchedule): number {
  return Object.values(schedule).reduce(
    (acc, day) => acc + Object.values(day).reduce((a, cell) => a + cellNames(cell).filter(v => v !== "").length, 0), 0
  );
}

export function countTotalSlots(schedule: WeeklySchedule): number {
  return Object.values(schedule).reduce(
    (acc, day) => acc + Object.values(day).reduce((a, cell) => a + cellNames(cell).length, 0), 0
  );
}

export function calculateWorkloads(schedule: WeeklySchedule): { [name: string]: number } {
  const workload: { [name: string]: number } = {};
  Object.values(schedule).forEach(day => {
    Object.values(day).forEach(cell => {
      cellNames(cell).forEach(name => {
        if (name) workload[name] = (workload[name] || 0) + 1;
      });
    });
  });
  return workload;
}
