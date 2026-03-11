export type WorkoutType = 'pull' | 'push' | 'legs' | 'other';
export type SessionStatus = 'booked' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';
export type CreatedVia = 'sms' | 'web' | 'admin';
export type WaitlistStatus = 'waiting' | 'offered' | 'claimed' | 'expired';
export type MessageDirection = 'inbound' | 'outbound';

export interface Member {
  id: string;
  name: string;
  phone: string;
  created_at: string;
  is_active: boolean;
  notes: string | null;
}

export interface Availability {
  id: string;
  day_of_week: number; // 0-6, Sunday-Saturday
  start_time: string; // HH:MM:SS
  end_time: string;
  is_recurring: boolean;
  specific_date: string | null; // YYYY-MM-DD
  is_blocked: boolean;
  max_capacity: number;
}

export interface Session {
  id: string;
  member_id: string;
  date: string; // YYYY-MM-DD
  start_time: string; // HH:MM:SS
  end_time: string;
  workout_type: WorkoutType;
  status: SessionStatus;
  attended: boolean;
  created_via: CreatedVia;
  notes: string | null;
  created_at: string;
  // Joined fields
  member?: Member;
}

export interface Waitlist {
  id: string;
  member_id: string;
  date: string;
  start_time: string;
  workout_type: WorkoutType;
  status: WaitlistStatus;
  offered_at: string | null;
  expires_at: string | null;
  created_at: string;
  member?: Member;
}

export interface Payment {
  id: string;
  member_id: string;
  session_id: string;
  amount: number;
  is_paid: boolean;
  paid_at: string | null;
  created_at: string;
  member?: Member;
  session?: Session;
}

export interface SmsConversation {
  id: string;
  member_id: string | null;
  phone: string;
  direction: MessageDirection;
  message: string;
  parsed_intent: ParsedIntent | null;
  created_at: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  created_at: string;
}

// SMS parsing types
export type SmsAction = 'book' | 'cancel' | 'check' | 'reschedule' | 'unknown';

export interface ParsedIntent {
  action: SmsAction;
  date?: string;
  time?: string;
  workout_type?: WorkoutType;
  confirmation_message: string;
  needs_clarification?: boolean;
  clarification_question?: string;
}

// API response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// Slot availability for booking UI
export interface TimeSlot {
  date: string;
  start_time: string;
  end_time: string;
  available_spots: number;
  max_capacity: number;
  is_available: boolean;
}

// Dashboard stats
export interface DashboardStats {
  today_sessions: number;
  week_sessions: number;
  month_sessions: number;
  active_members: number;
}
