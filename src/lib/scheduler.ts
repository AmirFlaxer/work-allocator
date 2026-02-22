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

  // Count how many days an employee is already assigned
  const getAssignedCount = (empId: string) =>
    Object.values(employeeAssignments[empId]).filter(Boolean).length;

  // Check if employee has reached their max weekly shifts
  const reachedMax = (emp: Employee) => {
    if (emp.maxWeeklyShifts === undefined || emp.maxWeeklyShifts === null) return false;
    return getAssignedCount(emp.id) >= emp.maxWeeklyShifts;
  };

  // Pass 1: Specific requests for starred employees (guaranteed)
  employees
    .filter(emp => emp.hasStar)
    .forEach(employee => {
      employee.specificRequests?.forEach(request => {
        if (
          weekDays.includes(request.date) &&
          !employee.unavailableDays?.includes(request.date) &&
          availableStationsFor(employee).includes(request.stationId) &&
          !reachedMax(employee)
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
      let assignedCount = getAssignedCount(employee.id);

      for (const date of weekDays) {
        if (assignedCount >= employee.minWeeklyShifts) break;
        if (reachedMax(employee)) break;
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
          !employeeAssignments[employee.id][request.date] &&
          !reachedMax(employee)
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
        if (reachedMax(employee)) break;

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
            !emp.unavailableDays?.includes(date) &&
            !reachedMax(emp)
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
          !emp.unavailableDays?.includes(date) &&
          !reachedMax(emp)
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
