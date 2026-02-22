import { Employee, Station, WeeklySchedule } from "@/types/employee";

export function generateWeeklySchedule(
  employees: Employee[],
  stations: Station[],
  weekStart: Date
): WeeklySchedule {
  const schedule: WeeklySchedule = {};
  const weekDays = getWeekDays(weekStart);

  // Initialize schedule structure
  weekDays.forEach(date => {
    schedule[date] = {};
    stations.forEach(station => {
      schedule[date][station.id] = "";
    });
  });

  // Track assignments per employee per day
  const employeeAssignments: { [employeeId: string]: { [date: string]: boolean } } = {};
  employees.forEach(emp => {
    employeeAssignments[emp.id] = {};
    weekDays.forEach(date => {
      employeeAssignments[emp.id][date] = false;
    });
  });

  const availableStationsFor = (emp: Employee) =>
    (emp.availableStations?.length ?? 0) === 0
      ? stations.map(s => s.id)
      : emp.availableStations;

  // Pass 1: Specific requests for starred employees (guaranteed)
  employees
    .filter(emp => emp.hasStar)
    .forEach(employee => {
      employee.specificRequests?.forEach(request => {
        if (
          weekDays.includes(request.date) &&
          !employee.unavailableDays?.includes(request.date) &&
          availableStationsFor(employee).includes(request.stationId)
        ) {
          schedule[request.date][request.stationId] = employee.name;
          employeeAssignments[employee.id][request.date] = true;
        }
      });
    });

  // Pass 2: Fill slots with starred employees (by minWeeklyShifts desc)
  employees
    .filter(emp => emp.hasStar)
    .sort((a, b) => b.minWeeklyShifts - a.minWeeklyShifts)
    .forEach(employee => {
      let assignedCount = Object.values(employeeAssignments[employee.id]).filter(Boolean).length;

      for (const date of weekDays) {
        if (assignedCount >= employee.minWeeklyShifts) break;
        if (employee.unavailableDays?.includes(date)) continue;
        if (employeeAssignments[employee.id][date]) continue;

        for (const stationId of availableStationsFor(employee)) {
          if (!schedule[date][stationId]) {
            schedule[date][stationId] = employee.name;
            employeeAssignments[employee.id][date] = true;
            assignedCount++;
            break;
          }
        }
      }
    });

  // Pass 3: Specific requests for non-starred employees (best effort)
  employees
    .filter(emp => !emp.hasStar)
    .forEach(employee => {
      employee.specificRequests?.forEach(request => {
        if (
          weekDays.includes(request.date) &&
          !employee.unavailableDays?.includes(request.date) &&
          availableStationsFor(employee).includes(request.stationId) &&
          !schedule[request.date][request.stationId] &&
          !employeeAssignments[employee.id][request.date]
        ) {
          schedule[request.date][request.stationId] = employee.name;
          employeeAssignments[employee.id][request.date] = true;
        }
      });
    });

  // Pass 4: Fill remaining with non-starred employees (one slot per day)
  employees
    .filter(emp => !emp.hasStar)
    .forEach(employee => {
      for (const date of weekDays) {
        if (employeeAssignments[employee.id][date]) continue;
        if (employee.unavailableDays?.includes(date)) continue;

        for (const stationId of availableStationsFor(employee)) {
          if (!schedule[date][stationId]) {
            schedule[date][stationId] = employee.name;
            employeeAssignments[employee.id][date] = true;
            break;
          }
        }
      }
    });

  // Pass 5: Second round — fill remaining empty slots
  weekDays.forEach(date => {
    stations.forEach(station => {
      if (!schedule[date][station.id]) {
        const candidate = employees
          .filter(emp => !emp.hasStar)
          .find(emp =>
            availableStationsFor(emp).includes(station.id) &&
            !employeeAssignments[emp.id][date] &&
            !emp.unavailableDays?.includes(date)
          );
        if (candidate) {
          schedule[date][station.id] = candidate.name;
          employeeAssignments[candidate.id][date] = true;
        }
      }
    });
  });

  // Pass 6: Last resort — allow multiple stations/day for employees who permit it
  weekDays.forEach(date => {
    stations.forEach(station => {
      if (!schedule[date][station.id]) {
        const multiEmployee = employees.find(emp =>
          availableStationsFor(emp).includes(station.id) &&
          emp.canWorkMultipleStations === true &&
          !emp.unavailableDays?.includes(date)
        );
        if (multiEmployee) {
          schedule[date][station.id] = multiEmployee.name;
        }
      }
    });
  });

  return schedule;
}

export function getWeekDays(weekStart: Date): string[] {
  return Array.from({ length: 5 }, (_, i) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + i);
    return date.toISOString().split("T")[0];
  });
}

export function countFilledSlots(schedule: WeeklySchedule): number {
  return Object.values(schedule).reduce(
    (acc, day) => acc + Object.values(day).filter(v => v !== "").length,
    0
  );
}

export function countTotalSlots(schedule: WeeklySchedule): number {
  return Object.values(schedule).reduce(
    (acc, day) => acc + Object.keys(day).length,
    0
  );
}

export function calculateWorkloads(schedule: WeeklySchedule): { [name: string]: number } {
  const workload: { [name: string]: number } = {};
  Object.values(schedule).forEach(day => {
    Object.values(day).forEach(name => {
      if (name) workload[name] = (workload[name] || 0) + 1;
    });
  });
  return workload;
}
