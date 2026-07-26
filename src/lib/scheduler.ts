import { Employee, Station, WeeklySchedule, SavedSchedule } from "@/types/employee";
import { getWeekDays, cellNames, stationSlots, cellKey, dailyShiftCap, latestSchedulePerWeek, parseISODate } from "@/lib/week";

export function generateWeeklySchedule(
  employees: Employee[],
  stations: Station[],
  weekStart: Date,
  activeDays: number[],
  baseSchedule?: WeeklySchedule,
  lockedCells?: Set<string>,
  savedSchedules?: SavedSchedule[]
): WeeklySchedule {
  const schedule: WeeklySchedule = {};
  const weekDays = getWeekDays(weekStart, activeDays);
  const recentLoad = savedSchedules ? calculateRecentLoad(savedSchedules, weekStart) : new Map<string, number>();

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

  // Track how many shifts each employee has per day (0 = none).
  const employeeAssignments: { [employeeId: string]: { [date: string]: number } } = {};
  employees.forEach(emp => {
    employeeAssignments[emp.id] = {};
    weekDays.forEach(date => {
      employeeAssignments[emp.id][date] = stations.filter(st =>
        slotArr(date, st.id).includes(emp.name)
      ).length;
    });
  });

  const availableStationsFor = (emp: Employee) =>
    (emp.availableStations?.length ?? 0) === 0
      ? stations.map(s => s.id)
      : emp.availableStations;

  // חסימת יום: "לא זמין" תמיד; "מעדיף שלא" רק כשמכבדים העדפות רכות
  // (respectSoft=false בשלבי אין-ברירה 7-8 ובבקשות ספציפיות).
  const isBlocked = (emp: Employee, date: string, respectSoft: boolean) =>
    (emp.unavailableDays?.includes(date) ?? false) ||
    (respectSoft && (emp.preferNotDays?.includes(date) ?? false));

  const getAssignedCount = (empId: string) =>
    Object.values(employeeAssignments[empId]).filter(c => c > 0).length;

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

  // Combined score: shifts assigned this week so far, plus shifts worked in
  // the recent-weeks history - so leastLoaded favors whoever has had the
  // least total exposure recently, not just within the current week.
  const totalRecentLoad = (emp: Employee) =>
    getAssignedCount(emp.id) + (recentLoad.get(emp.name) ?? 0);

  // Of the eligible employees, the one with the fewest total assigned shifts
  // (this week + recent history) - picking the first match would pile extra
  // shifts on whoever is listed first.
  const leastLoaded = (candidates: Employee[]): Employee | undefined =>
    candidates.reduce<Employee | undefined>((best, emp) =>
      !best || totalRecentLoad(emp) < totalRecentLoad(best) ? emp : best, undefined);

  const place = (date: string, stationId: number, emp: Employee) => {
    const slot = freeSlot(date, stationId);
    if (slot < 0) return false;
    slotArr(date, stationId)[slot] = emp.name;
    employeeAssignments[emp.id][date] += 1;
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

  // Pass 2: Fill with starred employees (by minWeeklyShifts desc, then recent
  // history ascending as a tie-break), one shift/day.
  employees
    .filter(emp => emp.hasStar)
    .sort((a, b) =>
      b.minWeeklyShifts - a.minWeeklyShifts ||
      (recentLoad.get(a.name) ?? 0) - (recentLoad.get(b.name) ?? 0))
    .forEach(employee => {
      let assignedCount = getAssignedCount(employee.id);
      for (const date of weekDays) {
        if (assignedCount >= employee.minWeeklyShifts) break;
        if (reachedMax(employee)) break;
        if (isBlocked(employee, date, true)) continue;
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

  // Pass 4: Fill with non-starred employees (one per day), least-recently-
  // loaded first so shifts don't pile on whoever the array happens to list first.
  employees
    .filter(emp => !emp.hasStar)
    .sort((a, b) => (recentLoad.get(a.name) ?? 0) - (recentLoad.get(b.name) ?? 0))
    .forEach(employee => {
    for (const date of weekDays) {
      if (employeeAssignments[employee.id][date]) continue;
      if (isBlocked(employee, date, true)) continue;
      if (reachedMax(employee)) break;
      for (const stationId of availableStationsFor(employee)) {
        if (place(date, stationId, employee)) break;
      }
    }
  });

  // שלבים 5+7: סבב מילוי למשבצות ריקות (משמרת ראשונה ביום, לא-מכוכבים).
  // respectSoft=true מכבד "מעדיף שלא"; false = סבב אין-ברירה.
  const runFillPass = (respectSoft: boolean) => {
    weekDays.forEach(date => {
      stations.forEach(station => {
        while (freeSlot(date, station.id) >= 0) {
          const candidate = leastLoaded(employees.filter(emp =>
            !emp.hasStar &&
            availableStationsFor(emp).includes(station.id) &&
            !employeeAssignments[emp.id][date] &&
            !isBlocked(emp, date, respectSoft) &&
            !reachedMax(emp)
          ));
          if (!candidate) break;
          place(date, station.id, candidate);
        }
      });
    });
  };

  // שלבים 6+8: מוצא אחרון - משמרות נוספות באותו יום עד התקרה היומית.
  const runMultiPass = (respectSoft: boolean) => {
    weekDays.forEach(date => {
      stations.forEach(station => {
        while (freeSlot(date, station.id) >= 0) {
          const multi = leastLoaded(employees.filter(emp =>
            availableStationsFor(emp).includes(station.id) &&
            employeeAssignments[emp.id][date] < dailyShiftCap(emp) &&
            !isBlocked(emp, date, respectSoft) &&
            !reachedMax(emp) &&
            !slotArr(date, station.id).includes(emp.name)
          ));
          if (!multi) break;
          const slot = freeSlot(date, station.id);
          slotArr(date, station.id)[slot] = multi.name;
          employeeAssignments[multi.id][date] += 1;
        }
      });
    });
  };

  // שלב 9: פאס-תיקון למינימומים שלא הושגו.
  // כל הפאסים עד כאן הם greedy עובד-אחר-עובד ונכנסים אך ורק למשבצות ריקות.
  // עובד שזמין במעט עמדות מפסיד אותן לעובדים גמישים שהגיעו קודם בתור, ונשאר
  // מתחת למינימום שלו גם כשקיים שיבוץ חוקי שמכבד את כולם. זה הפאס היחיד
  // שרשאי להוציא עובד ממשבצת - ורק כשיש לו עודף מעל המינימום שלו עצמו,
  // כדי לא לסתום חור אחד בפתיחת חור אחר.
  const runMinimumRepairPass = () => {
    const slack = (empId: string, min: number) => getAssignedCount(empId) - min;

    employees
      .filter(e => getAssignedCount(e.id) < e.minWeeklyShifts)
      // המוגבל ביותר קודם: לו יש הכי מעט חלופות, והוא זה שנרעב מלכתחילה.
      .sort((a, b) => availableStationsFor(a).length - availableStationsFor(b).length)
      .forEach(employee => {
        for (const date of weekDays) {
          if (getAssignedCount(employee.id) >= employee.minWeeklyShifts) break;
          if (reachedMax(employee)) break;
          // תיקון-מינימום גובר על "מעדיף שלא", אך לעולם לא על "לא זמין".
          if (isBlocked(employee, date, false)) continue;
          if (employeeAssignments[employee.id][date]) continue;

          const stationIds = availableStationsFor(employee);

          // משבצת ריקה קודמת להחלפה - היא מספקת את המינימום בלי לקחת מאיש.
          if (stationIds.some(stationId => place(date, stationId, employee))) continue;

          // אחרת: להוציא את בעל-העודף הגדול ביותר, כדי לפגוע במי שהכי פחות זקוק.
          let donorStation = -1, donorSlot = -1, donorEmp: Employee | undefined;
          stationIds.forEach(stationId => {
            const arr = slotArr(date, stationId);
            arr.forEach((name, i) => {
              if (!name || lockedCells?.has(cellKey(date, stationId, i))) return;
              const donor = employees.find(e => e.name === name);
              if (!donor || donor.id === employee.id) return;
              if (slack(donor.id, donor.minWeeklyShifts) <= 0) return;
              if (donorEmp && slack(donor.id, donor.minWeeklyShifts)
                            <= slack(donorEmp.id, donorEmp.minWeeklyShifts)) return;
              donorEmp = donor; donorStation = stationId; donorSlot = i;
            });
          });

          if (donorEmp) {
            slotArr(date, donorStation)[donorSlot] = employee.name;
            employeeAssignments[donorEmp.id][date] -= 1;
            employeeAssignments[employee.id][date] += 1;
          }
        }
      });
  };

  runFillPass(true);   // שלב 5
  runMultiPass(true);  // שלב 6
  runFillPass(false);  // שלב 7 - אין ברירה: מותר לשבץ בימי "מעדיף שלא"
  runMultiPass(false); // שלב 8
  runMinimumRepairPass(); // שלב 9

  // שלב 10: התורם שהוצא בשלב 9 התפנה - להחזירו למשבצת ריקה אם יש כזו.
  // בלי זה ההחלפה מתקנת מינימום אחד ומשאירה משבצת ריקה שהתורם יכול לאייש,
  // כלומר סוגרת פגם אחד ופותחת אחר. runFillPass מדלג על מכוכבים ולכן
  // runMultiPass הוא זה שמחזיר אותם - שניהם ללא כיבוד "מעדיף שלא", כמו
  // בשלבים 7-8, כי בשלב הזה כבר אין ברירה טובה יותר.
  runFillPass(false);
  runMultiPass(false);

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

// Total shifts each employee (by name) worked across the most recent
// weekCount saved weeks strictly before currentWeekStart - lets the
// generator favor whoever has had fewer shifts recently (inter-week fairness).
export function calculateRecentLoad(
  savedSchedules: SavedSchedule[],
  currentWeekStart: Date,
  weekCount = 4
): Map<string, number> {
  const currentWeekKey = getWeekDays(currentWeekStart, [0])[0];
  const priorWeeks = latestSchedulePerWeek(savedSchedules)
    .map(s => ({ saved: s, weekKey: getWeekDays(parseISODate(s.weekStart), [0])[0] }))
    .filter(({ weekKey }) => weekKey < currentWeekKey)
    .sort((a, b) => b.weekKey.localeCompare(a.weekKey))
    .slice(0, weekCount)
    .map(({ saved }) => saved);

  const load = new Map<string, number>();
  priorWeeks.forEach(saved => {
    Object.values(saved.schedule).forEach(day => {
      Object.values(day).forEach(cell => {
        cellNames(cell).forEach(name => {
          if (name) load.set(name, (load.get(name) ?? 0) + 1);
        });
      });
    });
  });
  return load;
}
