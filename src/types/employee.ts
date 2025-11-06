export interface Employee {
  id: string;
  name: string;
  availableStations: number[];
  hasStar: boolean;
  minWeeklyShifts: number;
  unavailableDays?: string[]; // ISO date strings
  specificRequests?: { date: string; stationId: number }[];
}

export interface Station {
  id: number;
  name: string;
}

export interface WeeklySchedule {
  [date: string]: {
    [stationId: number]: string; // employee name
  };
}
