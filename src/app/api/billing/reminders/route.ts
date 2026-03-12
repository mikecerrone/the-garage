import { NextRequest, NextResponse } from 'next/server';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { createAdminClient } from '@/lib/supabase/server';
import { sendSMS } from '@/lib/twilio';

const SESSION_RATE = 25;

// POST /api/billing/reminders - Send SMS reminders to members with unpaid balances
export async function POST(request: NextRequest) {
  try {
    const { month, monthLabel } = await request.json();

    if (!month || !monthLabel) {
      return NextResponse.json({ error: 'month and monthLabel are required' }, { status: 400 });
    }

    const monthDate = parseISO(month + '-01');
    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthDate);
    const startDate = format(monthStart, 'yyyy-MM-dd');
    const endDate = format(monthEnd, 'yyyy-MM-dd');

    const supabase = createAdminClient();

    // Get all attended sessions for the month with member info
    const { data: sessions, error: sessionsError } = await supabase
      .from('sessions')
      .select(`
        *,
        member:members(id, name, phone)
      `)
      .gte('date', startDate)
      .lte('date', endDate)
      .eq('attended', true);

    if (sessionsError) throw sessionsError;

    // Get payments for the month
    const { data: payments, error: paymentsError } = await supabase
      .from('payments')
      .select('*')
      .gte('created_at', monthStart.toISOString())
      .lte('created_at', monthEnd.toISOString())
      .eq('is_paid', true);

    if (paymentsError) throw paymentsError;

    // Calculate balances per member
    const memberBalances: Record<string, {
      name: string;
      phone: string;
      sessionCount: number;
      total: number;
      paid: number;
    }> = {};

    (sessions || []).forEach((session) => {
      const member = session.member as { id: string; name: string; phone: string } | null;
      if (!member) return;

      if (!memberBalances[member.id]) {
        memberBalances[member.id] = {
          name: member.name,
          phone: member.phone,
          sessionCount: 0,
          total: 0,
          paid: 0,
        };
      }

      memberBalances[member.id].sessionCount += 1;
      memberBalances[member.id].total += SESSION_RATE;
    });

    // Subtract paid amounts
    (payments || []).forEach((payment) => {
      if (memberBalances[payment.member_id]) {
        memberBalances[payment.member_id].paid += Number(payment.amount);
      }
    });

    // Filter to members with outstanding balance
    const membersOwing = Object.entries(memberBalances).filter(
      ([, data]) => data.total - data.paid > 0
    );

    let sent = 0;
    let failed = 0;

    for (const [memberId, data] of membersOwing) {
      const balance = data.total - data.paid;
      const message =
        `Hey ${data.name}! Just a friendly reminder from The Garage — ` +
        `your tab for ${monthLabel} is $${balance} ` +
        `(${data.sessionCount} session${data.sessionCount !== 1 ? 's' : ''} × $${SESSION_RATE}). ` +
        `Cash or Venmo works. Thanks!`;

      const success = await sendSMS(data.phone, message);

      // Log the outbound message
      const { data: member } = await supabase
        .from('members')
        .select('id')
        .eq('phone', data.phone)
        .single();

      await supabase.from('sms_conversations').insert({
        member_id: member?.id || null,
        phone: data.phone,
        direction: 'outbound',
        message,
      });

      if (success) {
        sent++;
      } else {
        failed++;
      }
    }

    return NextResponse.json({
      sent,
      failed,
      total: membersOwing.length,
    });
  } catch (error) {
    console.error('Error sending billing reminders:', error);
    return NextResponse.json(
      { error: 'Failed to send reminders' },
      { status: 500 }
    );
  }
}
