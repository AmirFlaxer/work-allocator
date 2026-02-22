export interface Employee {
  id: string;
  name: string;
  availableStations: number[];
  hasStar: boolean;
  minWeeklyShifts: number;
  unavailableDays?: string[];
  specificRequests?: { date: string; stationId: number }[];
  canWorkMultipleStations?: boolean;
}

export interface Station {
  id: number;
  name: string;
}

export interface WeeklySchedule {
  [date: string]: {
    [stationId: number]: string;
  };
}

export interface SavedSchedule {
  id: string;
  name: string;
  schedule: WeeklySchedule;
  weekStart: string;
  savedAt: string;
}

export type TaskPriority = 'low' | 'normal' | 'urgent' | 'critical';
export type TaskStatus = 'open' | 'in-progress' | 'done';

export interface Task {
  id: string;
  title: string;
  assignedTo: string;
  stationId?: number;
  date?: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate?: string;
  createdAt: string;
  completedAt?: string;
  note?: string;
}

export interface ScheduleLog {
  id: string;
  action: 'generated' | 'saved' | 'loaded' | 'modified';
  description: string;
  timestamp: string;
  weekStart?: string;
}
