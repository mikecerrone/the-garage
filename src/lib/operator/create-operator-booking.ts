import { createAdminClient } from '@/lib/supabase/server';
import { addHourToTime, ensureTimeWithSeconds, normalizePhone } from '@/lib/utils';
import type { Availability, Member, Session, WorkoutType } from '@/types/database';

type SlotAvailabilityState =
  | { kind: 'available'; currentBookings: number; maxCapacity: number }
  | { kind: 'blocked' }
  | { kind: 'outside_schedule' }
  | { kind: 'full'; currentBookings: number; maxCapacity: number };

export interface OperatorSession extends Session {
  member: Member;
}

export interface CreateOperatorBookingInput {
  allowConflict?: boolean;
  date: string;
  firstName?: string;
  memberId?: string;
  notes?: string | null;
  phone?: string;
  requestKey: string;
  source?: 'admin_dashboard' | 'quick_add';
  startTime: string;
  workoutType?: WorkoutType;
}

export type CreateOperatorBookingResult =
  | {
      kind: 'created' | 'existing';
      member: Member;
      session: OperatorSession;
    }
  | {
      code: 'blocked' | 'duplicate' | 'full' | 'outside_schedule';
      kind: 'conflict';
      member?: Member;
      message: string;
      session?: OperatorSession;
    };

export interface OperatorBookingRepository {
  countBookingsForSlot: (input: { date: string; startTime: string }) => Promise<number>;
  createMember: (input: { name: string; phone: string }) => Promise<Member>;
  findAvailabilityForSlot: (input: {
    date: string;
    startTime: string;
  }) => Promise<SlotAvailabilityState>;
  findExistingMemberBooking: (input: {
    date: string;
    memberId: string;
    startTime: string;
  }) => Promise<OperatorSession | null>;
  findMemberById: (memberId: string) => Promise<Member | null>;
  findMemberByPhone: (phone: string) => Promise<Member | null>;
  findSessionByRequestKey: (requestKey: string) => Promise<OperatorSession | null>;
  insertSession: (input: {
    date: string;
    endTime: string;
    memberId: string;
    notes: string | null;
    requestKey: string;
    startTime: string;
    workoutType: WorkoutType;
  }) => Promise<OperatorSession>;
}

function getDayOfWeek(date: string) {
  return new Date(`${date}T12:00:00`).getDay();
}

function createSupabaseRepository(): OperatorBookingRepository {
  const supabase = createAdminClient();

  return {
    async countBookingsForSlot({ date, startTime }) {
      const { count, error } = await supabase
        .from('sessions')
        .select('id', { count: 'exact', head: true })
        .eq('date', date)
        .eq('start_time', startTime)
        .neq('status', 'cancelled');

      if (error) {
        throw error;
      }

      return count || 0;
    },

    async createMember({ name, phone }) {
      const { data, error } = await supabase
        .from('members')
        .insert({
          name,
          phone,
        })
        .select('*')
        .single();

      if (error) {
        throw error;
      }

      return data;
    },

    async findAvailabilityForSlot({ date, startTime }) {
      const { data: blockedDate, error: blockedError } = await supabase
        .from('availability')
        .select('id')
        .eq('specific_date', date)
        .eq('is_blocked', true)
        .limit(1)
        .maybeSingle();

      if (blockedError) {
        throw blockedError;
      }

      if (blockedDate) {
        return { kind: 'blocked' } as const;
      }

      const { data: specificAvailability, error: specificError } = await supabase
        .from('availability')
        .select('*')
        .eq('specific_date', date)
        .eq('is_blocked', false);

      if (specificError) {
        throw specificError;
      }

      const { data: recurringAvailability, error: recurringError } = await supabase
        .from('availability')
        .select('*')
        .eq('day_of_week', getDayOfWeek(date))
        .eq('is_recurring', true)
        .is('specific_date', null)
        .eq('is_blocked', false);

      if (recurringError) {
        throw recurringError;
      }

      const availability =
        specificAvailability && specificAvailability.length > 0
          ? specificAvailability
          : recurringAvailability || [];

      const matchingAvailability = availability.filter((entry: Availability) => {
        return entry.start_time <= startTime && entry.end_time > startTime;
      });

      if (matchingAvailability.length === 0) {
        return { kind: 'outside_schedule' } as const;
      }

      const maxCapacity = Math.max(
        ...matchingAvailability.map((entry: Availability) => entry.max_capacity)
      );
      const currentBookings = await this.countBookingsForSlot({ date, startTime });

      if (currentBookings >= maxCapacity) {
        return { kind: 'full', currentBookings, maxCapacity } as const;
      }

      return { kind: 'available', currentBookings, maxCapacity } as const;
    },

    async findExistingMemberBooking({ date, memberId, startTime }) {
      const { data, error } = await supabase
        .from('sessions')
        .select('*, member:members(*)')
        .eq('member_id', memberId)
        .eq('date', date)
        .eq('start_time', startTime)
        .neq('status', 'cancelled')
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data;
    },

    async findMemberById(memberId) {
      const { data, error } = await supabase
        .from('members')
        .select('*')
        .eq('id', memberId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data;
    },

    async findMemberByPhone(phone) {
      const { data, error } = await supabase
        .from('members')
        .select('*')
        .eq('phone', phone)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data;
    },

    async findSessionByRequestKey(requestKey) {
      const { data, error } = await supabase
        .from('sessions')
        .select('*, member:members(*)')
        .eq('operator_request_key', requestKey)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data;
    },

    async insertSession({
      date,
      endTime,
      memberId,
      notes,
      requestKey,
      startTime,
      workoutType,
    }) {
      const { data, error } = await supabase
        .from('sessions')
        .insert({
          created_via: 'admin',
          date,
          end_time: endTime,
          member_id: memberId,
          notes,
          operator_request_key: requestKey,
          start_time: startTime,
          workout_type: workoutType,
        })
        .select('*, member:members(*)')
        .single();

      if (error) {
        throw error;
      }

      return data;
    },
  };
}

async function resolveMember(
  input: CreateOperatorBookingInput,
  repository: OperatorBookingRepository
) {
  if (input.memberId) {
    const member = await repository.findMemberById(input.memberId);
    if (!member) {
      throw new Error('Member not found.');
    }

    return member;
  }

  const normalizedPhone = normalizePhone(input.phone || '');
  if (!normalizedPhone || !input.firstName?.trim()) {
    throw new Error('First name and phone are required for new members.');
  }

  const existingMember = await repository.findMemberByPhone(normalizedPhone);
  if (existingMember) {
    return existingMember;
  }

  return repository.createMember({
    name: input.firstName.trim(),
    phone: normalizedPhone,
  });
}

function toConflictResult(
  state: SlotAvailabilityState,
  member?: Member,
  session?: OperatorSession | null
): CreateOperatorBookingResult {
  if (state.kind === 'blocked') {
    return {
      code: 'blocked',
      kind: 'conflict',
      member,
      message: 'That day is blocked off. Force add if you still want it on the calendar.',
      session: session || undefined,
    };
  }

  if (state.kind === 'outside_schedule') {
    return {
      code: 'outside_schedule',
      kind: 'conflict',
      member,
      message: 'That time is outside your saved schedule. Force add to book it anyway.',
      session: session || undefined,
    };
  }

  return {
    code: 'full',
    kind: 'conflict',
    member,
    message: 'That slot just filled up. Force add if you still want to squeeze someone in.',
    session: session || undefined,
  };
}

// Booking pipeline:
// 1. Resolve request token for idempotency.
// 2. Resolve or create the member.
// 3. Check duplicate/member conflicts and capacity rules.
// 4. Insert once and return the joined session payload.
export async function createOperatorBooking(
  input: CreateOperatorBookingInput,
  repository: OperatorBookingRepository = createSupabaseRepository()
): Promise<CreateOperatorBookingResult> {
  const startTime = ensureTimeWithSeconds(input.startTime);
  const endTime = addHourToTime(startTime);
  const requestKey = input.requestKey.trim();

  if (!requestKey) {
    throw new Error('A request key is required.');
  }

  const existingByRequestKey = await repository.findSessionByRequestKey(requestKey);
  if (existingByRequestKey) {
    return {
      kind: 'existing',
      member: existingByRequestKey.member,
      session: existingByRequestKey,
    };
  }

  const member = await resolveMember(input, repository);
  const existingMemberBooking = await repository.findExistingMemberBooking({
    date: input.date,
    memberId: member.id,
    startTime,
  });

  if (existingMemberBooking) {
    return {
      code: 'duplicate',
      kind: 'conflict',
      member,
      message: 'This member is already booked at that time.',
      session: existingMemberBooking,
    };
  }

  if (!input.allowConflict) {
    const slotState = await repository.findAvailabilityForSlot({
      date: input.date,
      startTime,
    });

    if (slotState.kind !== 'available') {
      return toConflictResult(slotState, member);
    }
  }

  try {
    const session = await repository.insertSession({
      date: input.date,
      endTime,
      memberId: member.id,
      notes: input.notes?.trim() || null,
      requestKey,
      startTime,
      workoutType: input.workoutType || 'other',
    });

    return {
      kind: 'created',
      member,
      session,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const uniqueRequestKeyConflict =
      message.includes('operator_request_key') || message.includes('sessions_operator_request_key');
    const uniqueMemberSlotConflict =
      message.includes('idx_sessions_member_slot_active') ||
      message.includes('member_slot_active') ||
      message.includes('member_id') && message.includes('start_time');

    if (uniqueRequestKeyConflict) {
      const existingSession = await repository.findSessionByRequestKey(requestKey);
      if (existingSession) {
        return {
          kind: 'existing',
          member: existingSession.member,
          session: existingSession,
        };
      }
    }

    if (uniqueMemberSlotConflict) {
      const existingSession = await repository.findExistingMemberBooking({
        date: input.date,
        memberId: member.id,
        startTime,
      });

      if (existingSession) {
        return {
          code: 'duplicate',
          kind: 'conflict',
          member,
          message: 'This member is already booked at that time.',
          session: existingSession,
        };
      }
    }

    throw error;
  }
}
