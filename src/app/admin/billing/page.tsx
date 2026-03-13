'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns';
import {
  DollarSign,
  Download,
  ChevronLeft,
  ChevronRight,
  Check,
  Clock,
  MessageSquare,
  CheckCircle2,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Payment, Session, Member } from '@/types/database';
import { formatDate, formatPhone } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';

const SESSION_RATE = 25;

interface MemberBilling {
  member: Member;
  sessions: number;
  total: number;
  paid: number;
  unpaid: number;
  payments: (Payment & { session?: { date: string; start_time: string } | null })[];
}

export default function BillingPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [billingData, setBillingData] = useState<MemberBilling[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingPayment, setUpdatingPayment] = useState<string | null>(null);
  const [markingAllPaid, setMarkingAllPaid] = useState<string | null>(null);
  const [sendingReminders, setSendingReminders] = useState(false);
  const [reminderResult, setReminderResult] = useState<{ sent: number; failed: number } | null>(null);

  const supabase = createClient();

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  useEffect(() => {
    fetchBillingData();
  }, [currentMonth]);

  async function fetchBillingData() {
    setLoading(true);
    try {
      const startDate = format(monthStart, 'yyyy-MM-dd');
      const endDate = format(monthEnd, 'yyyy-MM-dd');

      // Get all completed sessions for the month
      const { data: sessions, error: sessionsError } = await supabase
        .from('sessions')
        .select(`
          *,
          member:members(*)
        `)
        .gte('date', startDate)
        .lte('date', endDate)
        .eq('attended', true);

      if (sessionsError) throw sessionsError;

      // Get payments for the month
      const { data: payments, error: paymentsError } = await supabase
        .from('payments')
        .select(`
          *,
          session:sessions(date, start_time)
        `);

      if (paymentsError) throw paymentsError;

      const monthPayments = (payments || []).filter(
        (payment: Payment & { session?: { date: string; start_time: string } | null }) =>
          payment.session &&
          payment.session.date >= startDate &&
          payment.session.date <= endDate
      );

      // Group by member
      const memberMap: Record<string, MemberBilling> = {};

      (sessions || []).forEach((session: Session & { member?: Member }) => {
        if (!session.member) return;

        if (!memberMap[session.member_id]) {
          memberMap[session.member_id] = {
            member: session.member,
            sessions: 0,
            total: 0,
            paid: 0,
            unpaid: 0,
            payments: [],
          };
        }

        memberMap[session.member_id].sessions += 1;
        memberMap[session.member_id].total += SESSION_RATE;
      });

      // Add payment data
      monthPayments.forEach((payment: Payment & { session?: { date: string; start_time: string } | null }) => {
        if (memberMap[payment.member_id]) {
          memberMap[payment.member_id].payments.push(payment);
          if (payment.is_paid) {
            memberMap[payment.member_id].paid += Number(payment.amount);
          } else {
            memberMap[payment.member_id].unpaid += Number(payment.amount);
          }
        }
      });

      // Sort: unpaid first, then by total descending
      const sorted = Object.values(memberMap).sort((a, b) => {
        if (a.unpaid > 0 && b.unpaid === 0) return -1;
        if (a.unpaid === 0 && b.unpaid > 0) return 1;
        return b.total - a.total;
      });
      setBillingData(sorted);
    } catch (error) {
      console.error('Error fetching billing data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function togglePaymentStatus(paymentId: string, currentStatus: boolean) {
    setUpdatingPayment(paymentId);
    try {
      const { error } = await supabase
        .from('payments')
        .update({
          is_paid: !currentStatus,
          paid_at: !currentStatus ? new Date().toISOString() : null,
        })
        .eq('id', paymentId);

      if (error) throw error;
      fetchBillingData();
    } catch (error) {
      console.error('Error updating payment:', error);
    } finally {
      setUpdatingPayment(null);
    }
  }

  async function markAllPaidForMember(memberId: string) {
    setMarkingAllPaid(memberId);
    try {
      const paymentIds = billingData
        .find((memberBilling) => memberBilling.member.id === memberId)
        ?.payments.filter((payment) => !payment.is_paid)
        .map((payment) => payment.id) || [];

      if (paymentIds.length === 0) {
        return;
      }

      const { error } = await supabase
        .from('payments')
        .update({
          is_paid: true,
          paid_at: new Date().toISOString(),
        })
        .in('id', paymentIds);

      if (error) throw error;
      fetchBillingData();
    } catch (error) {
      console.error('Error marking all paid:', error);
    } finally {
      setMarkingAllPaid(null);
    }
  }

  async function sendBillingReminders() {
    setSendingReminders(true);
    setReminderResult(null);
    try {
      const monthLabel = format(currentMonth, 'MMMM');
      const response = await fetch('/api/billing/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: format(currentMonth, 'yyyy-MM'),
          monthLabel,
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setReminderResult({ sent: result.sent, failed: result.failed });
      setTimeout(() => setReminderResult(null), 5000);
    } catch (error) {
      console.error('Error sending reminders:', error);
    } finally {
      setSendingReminders(false);
    }
  }

  function exportCSV() {
    const headers = ['Member', 'Phone', 'Sessions', 'Total', 'Paid', 'Unpaid'];
    const rows = billingData.map((b) => [
      b.member.name,
      b.member.phone,
      b.sessions.toString(),
      `$${b.total}`,
      `$${b.paid}`,
      `$${b.total - b.paid}`,
    ]);

    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `garage-billing-${format(currentMonth, 'yyyy-MM')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalRevenue = billingData.reduce((sum, b) => sum + b.total, 0);
  const totalPaid = billingData.reduce((sum, b) => sum + b.paid, 0);
  const totalUnpaid = totalRevenue - totalPaid;
  const totalSessions = billingData.reduce((sum, b) => sum + b.sessions, 0);
  const membersWithBalance = billingData.filter(b => b.total - b.paid > 0).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cash Tab</h1>
          <p className="text-muted-foreground">
            ${SESSION_RATE}/session &middot; Billing and payment tracking
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" className="min-w-[140px]">
            {format(currentMonth, 'MMMM yyyy')}
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          {membersWithBalance > 0 && (
            <Button
              variant="outline"
              onClick={sendBillingReminders}
              disabled={sendingReminders}
            >
              {sendingReminders ? (
                <Spinner size="sm" />
              ) : reminderResult ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Sent to {reminderResult.sent}
                </>
              ) : (
                <>
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Text Reminders
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total</span>
            </div>
            <div className="text-2xl font-bold mt-1">${totalRevenue}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" />
              <span className="text-sm text-muted-foreground">Paid</span>
            </div>
            <div className="text-2xl font-bold mt-1 text-green-600">${totalPaid}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-orange-500" />
              <span className="text-sm text-muted-foreground">Outstanding</span>
            </div>
            <div className="text-2xl font-bold mt-1 text-orange-500">${totalUnpaid}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Sessions</div>
            <div className="text-2xl font-bold mt-1">{totalSessions}</div>
          </CardContent>
        </Card>
      </div>

      {/* Billing Table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : billingData.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <DollarSign className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">No sessions this month</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {billingData.map((billing) => {
            const balance = billing.total - billing.paid;
            const isPaidUp = balance <= 0;

            return (
              <Card key={billing.member.id} className={isPaidUp ? 'opacity-70' : ''}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                        isPaidUp ? 'bg-green-100' : 'bg-primary/10'
                      }`}>
                        {isPaidUp ? (
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                        ) : (
                          <span className="text-primary font-semibold">
                            {billing.member.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div>
                        <CardTitle className="text-base">{billing.member.name}</CardTitle>
                        <CardDescription>{formatPhone(billing.member.phone)}</CardDescription>
                      </div>
                    </div>
                    <div className="text-right flex items-center gap-3">
                      <div>
                        <div className="text-lg font-bold">${billing.total}</div>
                        <div className="text-sm text-muted-foreground">
                          {billing.sessions} session{billing.sessions !== 1 ? 's' : ''}
                        </div>
                      </div>
                      {!isPaidUp && (
                        <Button
                          onClick={() => markAllPaidForMember(billing.member.id)}
                          disabled={markingAllPaid === billing.member.id}
                          size="sm"
                        >
                          {markingAllPaid === billing.member.id ? (
                            <Spinner size="sm" />
                          ) : (
                            <>
                              <Check className="h-4 w-4 mr-1" />
                              Paid ${balance}
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-sm mb-3">
                    <div className="flex items-center gap-1">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-green-600">${billing.paid} paid</span>
                    </div>
                    {!isPaidUp && (
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4 text-orange-500" />
                        <span className="text-orange-500">${balance} unpaid</span>
                      </div>
                    )}
                    {isPaidUp && (
                      <Badge variant="outline" className="text-green-600 border-green-200">
                        Paid in full
                      </Badge>
                    )}
                  </div>

                  {/* Individual payments */}
                  {billing.payments.length > 0 && (
                    <div className="space-y-1">
                      {billing.payments.map((payment) => (
                        <div
                          key={payment.id}
                          className="flex items-center justify-between py-1.5 border-t border-border"
                        >
                          <div className="text-sm flex items-center gap-2">
                            <span>
                              {payment.session
                                ? formatDate(payment.session.date)
                                : 'Session'}
                            </span>
                            <span className="text-muted-foreground">
                              ${Number(payment.amount)}
                            </span>
                          </div>
                          <Button
                            variant={payment.is_paid ? 'outline' : 'default'}
                            size="sm"
                            className="h-7 text-xs"
                            disabled={updatingPayment === payment.id}
                            onClick={() =>
                              togglePaymentStatus(payment.id, payment.is_paid)
                            }
                          >
                            {updatingPayment === payment.id ? (
                              <Spinner size="sm" />
                            ) : payment.is_paid ? (
                              <>
                                <Check className="h-3 w-3 mr-1" />
                                Paid
                              </>
                            ) : (
                              'Mark Paid'
                            )}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
