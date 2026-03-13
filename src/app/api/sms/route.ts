import { NextRequest, NextResponse } from 'next/server';
import { format, addDays, parseISO } from 'date-fns';
import { createAdminClient } from '@/lib/supabase/server';
import { sendSMS } from '@/lib/twilio';
import { parseBookingIntent } from '@/lib/claude';
import { normalizePhone, getToday } from '@/lib/utils';
import { ParsedIntent, WorkoutType, TimeSlot } from '@/types/database';

// Handle incoming SMS from Twilio
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const from = formData.get('From') as string;
    const body = formData.get('Body') as string;

    if (!from || !body) {
      return new NextResponse('Missing required fields', { status: 400 });
    }

    const normalizedPhone = normalizePhone(from);
    const supabase = createAdminClient();

    // Find or create member
    const { data: member } = await supabase
      .from('members')
      .select('*')
      .eq('phone', normalizedPhone)
      .single();

    // Log inbound message
    await supabase.from('sms_conversations').insert({
      member_id: member?.id || null,
      phone: normalizedPhone,
      direction: 'inbound',
      message: body,
    });

    // Get conversation history (last 5 messages)
    const { data: recentMessages } = await supabase
      .from('sms_conversations')
      .select('direction, message')
      .eq('phone', normalizedPhone)
      .order('created_at', { ascending: false })
      .limit(5);

    const conversationHistory: { role: 'user' | 'assistant'; content: string }[] = (recentMessages || [])
      .reverse()
      .map((m) => ({
        role: (m.direction === 'inbound' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.message as string,
      }));

    // Get available slots for the next 7 days
    const availableSlots = await getAvailableSlots(supabase);

    // Get member's upcoming bookings
    const upcomingBookings = member
      ? await getMemberBookings(supabase, member.id)
      : [];

    // Parse intent with Claude
    const context = {
      memberName: member?.name || 'Neighbor',
      memberPhone: normalizedPhone,
      recentMessages: conversationHistory,
      availableSlots,
      upcomingBookings,
      currentDate: getToday(),
    };

    const intent = await parseBookingIntent(body, context);

    // Log parsed intent
    await supabase.from('sms_conversations').update({
      parsed_intent: intent,
    }).eq('phone', normalizedPhone).order('created_at', { ascending: false }).limit(1);

    // Execute the action
    let responseMessage = intent.confirmation_message;

    if (!intent.needs_clarification && intent.action !== 'unknown') {
      const result = await executeAction(supabase, intent, member, normalizedPhone);
      if (result.success) {
        responseMessage = result.message || intent.confirmation_message;
      } else {
        responseMessage = result.message || "Something went wrong. Please try again.";
      }
    }

    // Log outbound message
    await supabase.from('sms_conversations').insert({
      member_id: member?.id || null,
      phone: normalizedPhone,
      direction: 'outbound',
      message: responseMessage,
    });

    // Send SMS response
    await sendSMS(normalizedPhone, responseMessage);

    // Return TwiML response (empty, since we're sending via API)
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      {
        headers: { 'Content-Type': 'text/xml' },
      }
    );
  } catch (error) {
    console.error('SMS webhook error:', error);
    return new NextResponse('Internal server error', { status: 500 });
  }
}

async function getAvailableSlots(supabase: ReturnType<typeof createAdminClient>): Promise<TimeSlot[]> {
  const slots: TimeSlot[] = [];
  const today = getToday();

  for (let i = 0; i < 7; i++) {
    const date = format(addDays(parseISO(today), i), 'yyyy-MM-dd');
    const dayOfWeek = addDays(parseISO(today), i).getDay();

    // Get availability for this day
    const { data: availability } = await supabase
      .from('availability')
      .select('*')
      .or(`day_of_week.eq.${dayOfWeek},specific_date.eq.${date}`)
      .eq('is_blocked', false);

    if (!availability || availability.length === 0) continue;

    // Check for blocked date
    const { data: blockedDate } = await supabase
      .from('availability')
      .select('*')
      .eq('specific_date', date)
      .eq('is_blocked', true)
      .single();

    if (blockedDate) continue;

    // Get existing bookings for this day
    const { data: existingBookings } = await supabase
      .from('sessions')
      .select('start_time')
      .eq('date', date)
      .neq('status', 'cancelled');

    const bookingCounts: Record<string, number> = {};
    (existingBookings || []).forEach((b) => {
      const hour = b.start_time.slice(0, 5);
      bookingCounts[hour] = (bookingCounts[hour] || 0) + 1;
    });

    // Generate hourly slots from availability
    for (const avail of availability) {
      if (avail.specific_date && avail.specific_date !== date) continue;
      if (!avail.is_recurring && !avail.specific_date) continue;

      const startHour = parseInt(avail.start_time.split(':')[0]);
      const endHour = parseInt(avail.end_time.split(':')[0]);

      for (let hour = startHour; hour < endHour; hour++) {
        const timeKey = `${hour.toString().padStart(2, '0')}:00`;
        const booked = bookingCounts[timeKey] || 0;
        const available = avail.max_capacity - booked;

        if (available > 0) {
          slots.push({
            date,
            start_time: `${timeKey}:00`,
            end_time: `${(hour + 1).toString().padStart(2, '0')}:00:00`,
            available_spots: available,
            max_capacity: avail.max_capacity,
            is_available: true,
          });
        }
      }
    }
  }

  return slots;
}

async function getMemberBookings(
  supabase: ReturnType<typeof createAdminClient>,
  memberId: string
): Promise<{ date: string; time: string; workout: string }[]> {
  const { data } = await supabase
    .from('sessions')
    .select('date, start_time, workout_type')
    .eq('member_id', memberId)
    .gte('date', getToday())
    .neq('status', 'cancelled')
    .order('date')
    .limit(5);

  return (data || []).map((s) => ({
    date: s.date,
    time: s.start_time,
    workout: s.workout_type,
  }));
}

async function executeAction(
  supabase: ReturnType<typeof createAdminClient>,
  intent: ParsedIntent,
  member: { id: string; name: string } | null,
  phone: string
): Promise<{ success: boolean; message?: string }> {
  switch (intent.action) {
    case 'book': {
      if (!intent.date || !intent.time || !intent.workout_type) {
        return { success: false, message: "I need the date, time, and workout type to book. Try: 'Tuesday 9am Push'" };
      }

      // Create member if doesn't exist
      let memberId = member?.id;
      if (!memberId) {
        const { data: newMember, error } = await supabase
          .from('members')
          .insert({ name: 'New Neighbor', phone })
          .select()
          .single();

        if (error) {
          return { success: false, message: "Couldn't set up your account. Text Bob directly!" };
        }
        memberId = newMember.id;
      }

      // Check availability
      const startTime = intent.time.includes(':') ? intent.time + ':00' : intent.time + ':00:00';
      const endHour = parseInt(intent.time.split(':')[0]) + 1;
      const endTime = `${endHour.toString().padStart(2, '0')}:00:00`;

      const { data: existingBookings } = await supabase
        .from('sessions')
        .select('id')
        .eq('date', intent.date)
        .eq('start_time', startTime)
        .neq('status', 'cancelled');

      // TODO: Check against max capacity

      // Create booking
      const { error: bookingError } = await supabase.from('sessions').insert({
        member_id: memberId,
        date: intent.date,
        start_time: startTime,
        end_time: endTime,
        workout_type: intent.workout_type as WorkoutType,
        status: 'booked',
        created_via: 'sms',
      });

      if (bookingError) {
        console.error('Booking error:', bookingError);
        return { success: false, message: "Couldn't complete the booking. Please try again!" };
      }

      return { success: true };
    }

    case 'cancel': {
      if (!member) {
        return { success: false, message: "I don't have any bookings for this number." };
      }

      // Find the session to cancel
      let query = supabase
        .from('sessions')
        .select('*')
        .eq('member_id', member.id)
        .neq('status', 'cancelled')
        .gte('date', getToday());

      if (intent.date) {
        query = query.eq('date', intent.date);
      }

      const { data: sessions } = await query.order('date').limit(1);

      if (!sessions || sessions.length === 0) {
        return { success: false, message: "No upcoming sessions found to cancel." };
      }

      const { error } = await supabase
        .from('sessions')
        .update({ status: 'cancelled' })
        .eq('id', sessions[0].id);

      if (error) {
        return { success: false, message: "Couldn't cancel the session. Please try again!" };
      }

      return { success: true };
    }

    case 'check': {
      // Check action is informational - no DB changes needed
      return { success: true };
    }

    case 'reschedule': {
      // For now, treat reschedule as a cancel + book suggestion
      return {
        success: true,
        message: "To reschedule, just tell me the new date and time you want. I'll cancel your current session and book the new one!"
      };
    }

    default:
      return { success: true };
  }
}
