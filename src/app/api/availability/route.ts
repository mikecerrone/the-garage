import { NextRequest, NextResponse } from 'next/server';
import { format, addDays, parseISO } from 'date-fns';
import { createAdminClient } from '@/lib/supabase/server';
import { getToday } from '@/lib/utils';
import { TimeSlot } from '@/types/database';

// GET /api/availability - Get available slots for booking
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const days = parseInt(searchParams.get('days') || '7');
    const date = searchParams.get('date'); // Specific date to check

    const supabase = createAdminClient();
    const slots: TimeSlot[] = [];
    const today = getToday();

    const startDate = date ? date : today;
    const numDays = date ? 1 : Math.min(days, 14);

    for (let i = 0; i < numDays; i++) {
      const currentDate = format(addDays(parseISO(startDate), i), 'yyyy-MM-dd');
      const dayOfWeek = addDays(parseISO(startDate), i).getDay();

      // Check for blocked date first
      const { data: blockedDate } = await supabase
        .from('availability')
        .select('*')
        .eq('specific_date', currentDate)
        .eq('is_blocked', true)
        .single();

      if (blockedDate) continue;

      // Get recurring availability for this day of week
      const { data: recurringAvail } = await supabase
        .from('availability')
        .select('*')
        .eq('day_of_week', dayOfWeek)
        .eq('is_recurring', true)
        .is('specific_date', null)
        .eq('is_blocked', false);

      // Get specific date overrides
      const { data: specificAvail } = await supabase
        .from('availability')
        .select('*')
        .eq('specific_date', currentDate)
        .eq('is_blocked', false);

      // Use specific date availability if exists, otherwise use recurring
      const availability = (specificAvail && specificAvail.length > 0)
        ? specificAvail
        : (recurringAvail || []);

      if (availability.length === 0) continue;

      // Get existing bookings for this day
      const { data: existingBookings } = await supabase
        .from('sessions')
        .select('start_time')
        .eq('date', currentDate)
        .neq('status', 'cancelled');

      const bookingCounts: Record<string, number> = {};
      (existingBookings || []).forEach((b) => {
        const hour = b.start_time.slice(0, 5);
        bookingCounts[hour] = (bookingCounts[hour] || 0) + 1;
      });

      // Generate hourly slots
      for (const avail of availability) {
        const startHour = parseInt(avail.start_time.split(':')[0]);
        const endHour = parseInt(avail.end_time.split(':')[0]);

        for (let hour = startHour; hour < endHour; hour++) {
          const timeKey = `${hour.toString().padStart(2, '0')}:00`;
          const booked = bookingCounts[timeKey] || 0;
          const available = avail.max_capacity - booked;

          if (available > 0) {
            slots.push({
              date: currentDate,
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

    // Sort by date and time
    slots.sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return a.start_time.localeCompare(b.start_time);
    });

    return NextResponse.json({ slots });
  } catch (error) {
    console.error('Error fetching availability:', error);
    return NextResponse.json(
      { error: 'Failed to fetch availability' },
      { status: 500 }
    );
  }
}
