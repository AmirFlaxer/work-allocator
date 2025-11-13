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

  // First pass: Handle specific requests for starred employees
  employees
    .filter(emp => emp.hasStar)
    .forEach(employee => {
      employee.specificRequests?.forEach(request => {
        if (weekDays.includes(request.date)) {
          if ((employee.availableStations?.length ?? 0) === 0 || employee.availableStations.includes(request.stationId)) {
            schedule[request.date][request.stationId] = employee.name;
            employeeAssignments[employee.id][request.date] = true;
          }
        }
      });
    });

  // Second pass: Fill remaining slots with starred employees first
  employees
    .filter(emp => emp.hasStar)
    .sort((a, b) => b.minWeeklyShifts - a.minWeeklyShifts)
    .forEach(employee => {
      let assignedCount = Object.values(employeeAssignments[employee.id]).filter(Boolean).length;
      
      for (const date of weekDays) {
        if (assignedCount >= employee.minWeeklyShifts) break;
        if (employee.unavailableDays?.includes(date)) continue;
        if (employeeAssignments[employee.id][date]) continue;

        for (const stationId of ((employee.availableStations?.length ?? 0) === 0 ? stations.map(s => s.id) : employee.availableStations)) {
          if (!schedule[date][stationId]) {
            schedule[date][stationId] = employee.name;
            employeeAssignments[employee.id][date] = true;
            assignedCount++;
            break;
          }
        }
      }
    });

  // Third pass: Try to honor non-starred employee requests (best effort)
  employees
    .filter(emp => !emp.hasStar)
    .forEach(employee => {
      employee.specificRequests?.forEach(request => {
        if (weekDays.includes(request.date)) {
          if ((employee.availableStations?.length ?? 0) === 0 || employee.availableStations.includes(request.stationId)) {
            // Only assign if slot is empty and employee is not already assigned that day
            if (!schedule[request.date][request.stationId] && !employeeAssignments[employee.id][request.date]) {
              schedule[request.date][request.stationId] = employee.name;
              employeeAssignments[employee.id][request.date] = true;
            }
          }
        }
      });
    });

  // Fourth pass: Fill remaining slots with non-starred employees (respect unavailability)
  employees
    .filter(emp => !emp.hasStar)
    .forEach(employee => {
      for (const date of weekDays) {
        if (employeeAssignments[employee.id][date]) continue;
        if (employee.unavailableDays?.includes(date)) continue;
        
        for (const stationId of ((employee.availableStations?.length ?? 0) === 0 ? stations.map(s => s.id) : employee.availableStations)) {
          if (!schedule[date][stationId]) {
            schedule[date][stationId] = employee.name;
            employeeAssignments[employee.id][date] = true;
            break;
          }
        }
      }
    });

  // Fifth pass: Fill remaining slots ignoring unavailability for non-starred employees
  weekDays.forEach(date => {
    stations.forEach(station => {
      if (!schedule[date][station.id]) {
        // Try non-starred employees first (even if unavailable)
        const nonStarredEmployee = employees
          .filter(emp => !emp.hasStar)
          .find(emp => 
            emp.availableStations.includes(station.id) && 
            !employeeAssignments[emp.id][date]
          );
        
        if (nonStarredEmployee) {
          schedule[date][station.id] = nonStarredEmployee.name;
          employeeAssignments[nonStarredEmployee.id][date] = true;
        }
      }
    });
  });

  // Sixth pass: If still empty, allow multiple assignments per day ONLY for employees who allow it
  weekDays.forEach(date => {
    stations.forEach(station => {
      if (!schedule[date][station.id]) {
        // Find ANY employee who can work this station AND allows multiple assignments
        const multipleEmployee = employees.find(emp => 
          emp.availableStations.includes(station.id) &&
          emp.canWorkMultipleStations === true
        );
        
        if (multipleEmployee) {
          schedule[date][station.id] = multipleEmployee.name;
        }
      }
    });
  });

  return schedule;
}

function getWeekDays(weekStart: Date): string[] {
  const days: string[] = [];
  for (let i = 0; i < 5; i++) { // Sunday to Thursday
    const date = new Date(weekStart);
    date.setDate(date.getDate() + i);
    days.push(date.toISOString().split('T')[0]);
  }
  return days;
}

function needsFillingDesperately(
  schedule: WeeklySchedule,
  stations: Station[],
  weekDays: string[]
): boolean {
  let emptySlots = 0;
  weekDays.forEach(date => {
    stations.forEach(station => {
      if (!schedule[date][station.id]) emptySlots++;
    });
  });
  return emptySlots > stations.length * 2; // More than 2 days worth of empty slots
}
