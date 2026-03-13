import { describe, expect, it, vi } from 'vitest';
import type {
  CreateOperatorBookingInput,
  OperatorBookingRepository,
  OperatorSession,
} from '@/lib/operator/create-operator-booking';
import { createOperatorBooking } from '@/lib/operator/create-operator-booking';
import type { Member } from '@/types/database';

function createMember(overrides: Partial<Member> = {}): Member {
  return {
    created_at: '2026-03-12T10:00:00Z',
    id: 'member-1',
    is_active: true,
    name: 'Bob',
    notes: null,
    phone: '+16155551212',
    ...overrides,
  };
}

function createSession(member: Member, overrides: Partial<OperatorSession> = {}): OperatorSession {
  return {
    attended: false,
    created_at: '2026-03-12T10:00:00Z',
    created_via: 'admin',
    date: '2026-03-12',
    end_time: '10:00:00',
    id: 'session-1',
    member,
    member_id: member.id,
    notes: null,
    operator_request_key: 'request-1',
    start_time: '09:00:00',
    status: 'booked',
    workout_type: 'other',
    ...overrides,
  };
}

function createRepository(overrides: Partial<OperatorBookingRepository> = {}): OperatorBookingRepository {
  const member = createMember();
  const session = createSession(member);

  return {
    countBookingsForSlot: vi.fn().mockResolvedValue(0),
    createMember: vi.fn().mockResolvedValue(member),
    findAvailabilityForSlot: vi
      .fn()
      .mockResolvedValue({ kind: 'available', currentBookings: 0, maxCapacity: 2 }),
    findExistingMemberBooking: vi.fn().mockResolvedValue(null),
    findMemberById: vi.fn().mockResolvedValue(member),
    findMemberByPhone: vi.fn().mockResolvedValue(null),
    findSessionByRequestKey: vi.fn().mockResolvedValue(null),
    insertSession: vi.fn().mockResolvedValue(session),
    ...overrides,
  };
}

const baseInput: CreateOperatorBookingInput = {
  date: '2026-03-12',
  memberId: 'member-1',
  requestKey: 'request-1',
  startTime: '09:00',
  workoutType: 'other',
};

describe('createOperatorBooking', () => {
  it('returns an existing session when the idempotency key was already used', async () => {
    const existingMember = createMember();
    const existingSession = createSession(existingMember);
    const repository = createRepository({
      findSessionByRequestKey: vi.fn().mockResolvedValue(existingSession),
    });

    const result = await createOperatorBooking(baseInput, repository);

    expect(result).toMatchObject({
      kind: 'existing',
      session: { id: 'session-1' },
    });
    expect(repository.insertSession).not.toHaveBeenCalled();
  });

  it('returns a duplicate conflict when the member is already booked at that time', async () => {
    const member = createMember();
    const repository = createRepository({
      findExistingMemberBooking: vi
        .fn()
        .mockResolvedValue(createSession(member, { operator_request_key: 'other-request' })),
      findMemberById: vi.fn().mockResolvedValue(member),
    });

    const result = await createOperatorBooking(baseInput, repository);

    expect(result).toMatchObject({
      code: 'duplicate',
      kind: 'conflict',
    });
    expect(repository.insertSession).not.toHaveBeenCalled();
  });

  it('returns an outside-schedule conflict unless an override is supplied', async () => {
    const repository = createRepository({
      findAvailabilityForSlot: vi.fn().mockResolvedValue({ kind: 'outside_schedule' }),
    });

    const result = await createOperatorBooking(baseInput, repository);

    expect(result).toMatchObject({
      code: 'outside_schedule',
      kind: 'conflict',
    });
  });

  it('creates new members and preserves non-hour start times', async () => {
    const newMember = createMember({ id: 'member-2', name: 'Maggie', phone: '+16155550000' });
    const repository = createRepository({
      createMember: vi.fn().mockResolvedValue(newMember),
      findMemberById: vi.fn().mockResolvedValue(null),
      findMemberByPhone: vi.fn().mockResolvedValue(null),
      insertSession: vi.fn().mockResolvedValue(
        createSession(newMember, {
          end_time: '10:30:00',
          member: newMember,
          member_id: newMember.id,
          start_time: '09:30:00',
        })
      ),
    });

    const result = await createOperatorBooking(
      {
        date: '2026-03-12',
        firstName: 'Maggie',
        phone: '(615) 555-0000',
        requestKey: 'request-2',
        startTime: '09:30',
        workoutType: 'legs',
      },
      repository
    );

    expect(result).toMatchObject({
      kind: 'created',
      session: { end_time: '10:30:00', start_time: '09:30:00' },
    });
    expect(repository.createMember).toHaveBeenCalledWith({
      name: 'Maggie',
      phone: '+16155550000',
    });
  });

  it('lets an operator force add after a conflict', async () => {
    const repository = createRepository({
      findAvailabilityForSlot: vi.fn().mockResolvedValue({ kind: 'full', currentBookings: 3, maxCapacity: 3 }),
    });

    const result = await createOperatorBooking(
      { ...baseInput, allowConflict: true },
      repository
    );

    expect(result).toMatchObject({
      kind: 'created',
      session: { id: 'session-1' },
    });
    expect(repository.insertSession).toHaveBeenCalled();
  });

  it('re-hydrates an existing session when insert hits the unique request key', async () => {
    const member = createMember();
    const repository = createRepository({
      findMemberById: vi.fn().mockResolvedValue(member),
      findSessionByRequestKey: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(createSession(member)),
      insertSession: vi.fn().mockRejectedValue(new Error('duplicate key value violates unique constraint "sessions_operator_request_key_key"')),
    });

    const result = await createOperatorBooking(baseInput, repository);

    expect(result).toMatchObject({
      kind: 'existing',
      session: { id: 'session-1' },
    });
  });
});
