import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { WorkoutType } from '@/types/database';
import { normalizePhone, getToday } from '@/lib/utils';

// POST /api/sessions - Create a new session booking
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phone, date, start_time, workout_type, name } = body;

    if (!phone || !date || !start_time || !workout_type) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const normalizedPhone = normalizePhone(phone);

    // Find or create member
    let { data: member } = await supabase
      .from('members')
      .select('*')
      .eq('phone', normalizedPhone)
      .single();

    if (!member) {
      const { data: newMember, error: memberError } = await supabase
        .from('members')
        .insert({
          name: name || 'Neighbor',
          phone: normalizedPhone,
        })
        .select()
        .single();

      if (memberError) {
        return NextResponse.json(
          { error: 'Failed to create member' },
          { status: 500 }
        );
      }
      member = newMember;
    }

    // Calculate end time (1 hour later)
    const startHour = parseInt(start_time.split(':')[0]);
    const endTime = `${(startHour + 1).toString().padStart(2, '0')}:00:00`;

    // Check if slot is still available
    const { data: existingBookings } = await supabase
      .from('sessions')
      .select('id')
      .eq('date', date)
      .eq('start_time', start_time.includes(':00:00') ? start_time : start_time + ':00')
      .neq('status', 'cancelled');

    // Get max capacity for this slot
    const dayOfWeek = new Date(date).getDay();
    const { data: availability } = await supabase
      .from('availability')
      .select('max_capacity')
      .or(`and(day_of_week.eq.${dayOfWeek},is_recurring.eq.true),specific_date.eq.${date}`)
      .eq('is_blocked', false)
      .limit(1)
      .single();

    const maxCapacity = availability?.max_capacity || 1;
    const currentBookings = existingBookings?.length || 0;

    if (currentBookings >= maxCapacity) {
      return NextResponse.json(
        { error: 'This slot is no longer available' },
        { status: 409 }
      );
    }

    // Create the session
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .insert({
        member_id: member.id,
        date,
        start_time: start_time.includes(':00:00') ? start_time : start_time + ':00',
        end_time: endTime,
        workout_type: workout_type as WorkoutType,
        status: 'booked',
        created_via: 'web',
      })
      .select()
      .single();

    if (sessionError) {
      console.error('Session creation error:', sessionError);
      return NextResponse.json(
        { error: 'Failed to create booking' },
        { status: 500 }
      );
    }

    return NextResponse.json({ session, member });
  } catch (error) {
    console.error('Error creating session:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET /api/sessions - Get sessions for a member by phone
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const phone = searchParams.get('phone');

    if (!phone) {
      return NextResponse.json(
        { error: 'Phone number required' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const normalizedPhone = normalizePhone(phone);

    // Find member
    const { data: member } = await supabase
      .from('members')
      .select('*')
      .eq('phone', normalizedPhone)
      .single();

    if (!member) {
      return NextResponse.json({ sessions: [], member: null });
    }

    // Get upcoming sessions
    const { data: sessions } = await supabase
      .from('sessions')
      .select('*')
      .eq('member_id', member.id)
      .gte('date', getToday())
      .neq('status', 'cancelled')
      .order('date')
      .order('start_time');

    return NextResponse.json({ sessions: sessions || [], member });
  } catch (error) {
    console.error('Error fetching sessions:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/sessions - Cancel a session
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sessionId = searchParams.get('id');
    const phone = searchParams.get('phone');

    if (!sessionId || !phone) {
      return NextResponse.json(
        { error: 'Session ID and phone required' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const normalizedPhone = normalizePhone(phone);

    // Verify the session belongs to this member
    const { data: member } = await supabase
      .from('members')
      .select('id')
      .eq('phone', normalizedPhone)
      .single();

    if (!member) {
      return NextResponse.json(
        { error: 'Member not found' },
        { status: 404 }
      );
    }

    const { data: session } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('member_id', member.id)
      .single();

    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // Cancel the session
    const { error } = await supabase
      .from('sessions')
      .update({ status: 'cancelled' })
      .eq('id', sessionId);

    if (error) {
      return NextResponse.json(
        { error: 'Failed to cancel session' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error cancelling session:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
