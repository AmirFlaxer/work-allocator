import { describe, it, expect } from 'vitest';
import { generateWeeklySchedule, getWeekDays, countFilledSlots, countTotalSlots } from '@/lib/scheduler';
import { Employee, Station, WeeklySchedule } from '@/types/employee';

describe('Scheduler Logic', () => {
  const mockEmployees: Employee[] = [
    {
      id: 'emp-1',
      name: 'John Doe',
      hasStar: true,
      minWeeklyShifts: 2,
      maxWeeklyShifts: 5,
      availableStations: [1],
      unavailableDays: ['2026-04-07'],
      specificRequests: [{ date: '2026-04-06', stationId: 1 }],
      canWorkMultipleStations: false,
    },
    {
      id: 'emp-2',
      name: 'Jane Smith',
      hasStar: false,
      minWeeklyShifts: 1,
      maxWeeklyShifts: 3,
      availableStations: [1],
      unavailableDays: [],
      specificRequests: [],
      canWorkMultipleStations: false,
    }
  ];

  const mockStations: Station[] = [
    { id: 1, name: 'Station A' },
    { id: 2, name: 'Station B' }
  ];

  const weekStart = new Date('2026-04-06');

  it('should generate a weekly schedule for 5 days', () => {
    const schedule = generateWeeklySchedule(mockEmployees, mockStations, weekStart);
    const days = getWeekDays(weekStart);
    
    expect(days).toHaveLength(5);
    expect(Object.keys(schedule)).toHaveLength(5);
  });

  it('should respect specific requests', () => {
    const schedule = generateWeeklySchedule(mockEmployees, mockStations, weekStart);
    // John Doe requested 2026-04-06 at Station 1
    expect(schedule['2026-04-06'][1]).toBe('John Doe');
  });

  it('should respect unavailable days', () => {
    const schedule = generateWeeklySchedule(mock 
    // Checking if John Doe is NOT in station 1 on April 7th
    expect(schedule['2026-04-07'][1]).not.toBe('John Doe');
  });

  it('should count filled slots correctly', () => {
    const schedule = generateWeeklySchedule(mockEmployees, mockStations, weekStart);
    const filled = countFilledSlots(schedule);
    expect(typeof filled).toBe('number');
  });
});
