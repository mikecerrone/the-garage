import { NextRequest, NextResponse } from 'next/server';
import { createOperatorBooking } from '@/lib/operator/create-operator-booking';
import { getOperatorAccess } from '@/lib/operator-access';

export async function POST(request: NextRequest) {
  const access = await getOperatorAccess();
  if (!access.isOperator) {
    return NextResponse.json(
      { error: 'Please sign in again.' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const {
      allowConflict,
      date,
      firstName,
      memberId,
      notes,
      phone,
      requestKey,
      source,
      startTime,
      workoutType,
    } = body;

    if (!date || !requestKey || !startTime) {
      return NextResponse.json(
        { error: 'Date, time, and request key are required.' },
        { status: 400 }
      );
    }

    if (!memberId && (!firstName || !phone)) {
      return NextResponse.json(
        { error: 'Pick a member or add a first name and phone number.' },
        { status: 400 }
      );
    }

    if (source === 'quick_add') {
      console.info(
        JSON.stringify({
          date,
          event: 'quick_add_save_started',
          requestKey,
          startTime,
        })
      );
    }

    const result = await createOperatorBooking({
      allowConflict,
      date,
      firstName,
      memberId,
      notes,
      phone,
      requestKey,
      source,
      startTime,
      workoutType,
    });

    if (result.kind === 'conflict') {
      if (source === 'quick_add') {
        console.info(
          JSON.stringify({
            code: result.code,
            event: 'quick_add_conflict_detected',
            requestKey,
          })
        );
      }

      return NextResponse.json(
        {
          code: result.code,
          error: result.message,
          member: result.member,
          session: result.session,
        },
        { status: 409 }
      );
    }

    if (source === 'quick_add') {
      console.info(
        JSON.stringify({
          event: result.kind === 'existing'
            ? 'quick_add_save_succeeded_existing'
            : 'quick_add_save_succeeded',
          requestKey,
          sessionId: result.session.id,
        })
      );
    }

    return NextResponse.json({
      member: result.member,
      result: result.kind,
      session: result.session,
    });
  } catch (error) {
    console.error('Error creating operator booking:', error);
    return NextResponse.json(
      { error: 'Booking not saved. Try again.' },
      { status: 500 }
    );
  }
}
