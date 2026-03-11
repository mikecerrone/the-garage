import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, parseISO, addHours, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';
import { toZonedTime, formatInTimeZone } from 'date-fns-tz';
import { WorkoutType } from '@/types/database';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const TIMEZONE = process.env.TIMEZONE || 'America/New_York';

// Date/time utilities
export function formatTime(time: string): string {
  // time is in HH:MM:SS format
  const [hours, minutes] = time.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0);
  return format(date, 'h:mm a');
}

export function formatDate(dateStr: string): string {
  return format(parseISO(dateStr), 'EEE, MMM d');
}

export function formatDateFull(dateStr: string): string {
  return format(parseISO(dateStr), 'EEEE, MMMM d, yyyy');
}

export function getToday(): string {
  const now = toZonedTime(new Date(), TIMEZONE);
  return format(now, 'yyyy-MM-dd');
}

export function getTomorrow(): string {
  const now = toZonedTime(new Date(), TIMEZONE);
  return format(addHours(now, 24), 'yyyy-MM-dd');
}

export function getCurrentWeekDates(): string[] {
  const now = toZonedTime(new Date(), TIMEZONE);
  const start = startOfWeek(now, { weekStartsOn: 0 });
  const end = endOfWeek(now, { weekStartsOn: 0 });
  return eachDayOfInterval({ start, end }).map(d => format(d, 'yyyy-MM-dd'));
}

export function getDayName(dayOfWeek: number): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[dayOfWeek];
}

// Workout type colors and labels
export const workoutTypeConfig: Record<WorkoutType, { label: string; color: string; bgColor: string }> = {
  pull: { label: 'Pull (Arms)', color: 'text-blue-700', bgColor: 'bg-blue-100' },
  push: { label: 'Push (Chest)', color: 'text-red-700', bgColor: 'bg-red-100' },
  legs: { label: 'Legs', color: 'text-green-700', bgColor: 'bg-green-100' },
  other: { label: 'Other', color: 'text-gray-700', bgColor: 'bg-gray-100' },
};

export function getWorkoutLabel(type: WorkoutType): string {
  return workoutTypeConfig[type].label;
}

export function getWorkoutColor(type: WorkoutType): string {
  return workoutTypeConfig[type].color;
}

export function getWorkoutBgColor(type: WorkoutType): string {
  return workoutTypeConfig[type].bgColor;
}

// Phone number formatting
export function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `(${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  return phone;
}

export function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `+1${cleaned}`;
  }
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+${cleaned}`;
  }
  return phone;
}

// Generate hourly slots from a time range
export function generateHourlySlots(startTime: string, endTime: string): string[] {
  const slots: string[] = [];
  const [startHour] = startTime.split(':').map(Number);
  const [endHour] = endTime.split(':').map(Number);

  for (let hour = startHour; hour < endHour; hour++) {
    slots.push(`${hour.toString().padStart(2, '0')}:00:00`);
  }

  return slots;
}
