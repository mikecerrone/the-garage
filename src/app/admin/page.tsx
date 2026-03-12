'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import {
  Calendar,
  Clock,
  User,
  Plus,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Session, WorkoutType } from '@/types/database';
import { formatTime, formatDate, getToday, workoutTypeConfig } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

function createRequestKey() {
  if (typeof window !== 'undefined' && typeof window.crypto?.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }

  return `admin-booking-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function AdminDashboard() {
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);

  const supabase = createClient();

  useEffect(() => {
    fetchSessions();
  }, [selectedDate]);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const queryDate = searchParams.get('date');

    if (queryDate) {
      setSelectedDate(queryDate);
    }
  }, []);

  async function fetchSessions() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('sessions')
        .select(`
          *,
          member:members(*)
        `)
        .eq('date', selectedDate)
        .neq('status', 'cancelled')
        .order('start_time');

      if (error) throw error;
      setSessions(data || []);
    } catch (error) {
      console.error('Error fetching sessions:', error);
    } finally {
      setLoading(false);
    }
  }

  async function toggleAttendance(session: Session) {
    try {
      const newAttended = !session.attended;
      const newStatus = newAttended ? 'completed' : 'booked';

      const { error } = await supabase
        .from('sessions')
        .update({ attended: newAttended, status: newStatus })
        .eq('id', session.id);

      if (error) throw error;

      const { data: existingPayments, error: paymentsError } = await supabase
        .from('payments')
        .select('id')
        .eq('session_id', session.id);

      if (paymentsError) throw paymentsError;

      if (newAttended) {
        if (!existingPayments || existingPayments.length === 0) {
          const sessionRate = parseInt(process.env.NEXT_PUBLIC_SESSION_RATE || '25');
          const { error: insertError } = await supabase.from('payments').insert({
            member_id: session.member_id,
            session_id: session.id,
            amount: sessionRate,
            is_paid: false,
          });

          if (insertError) throw insertError;
        }
      } else if (existingPayments && existingPayments.length > 0) {
        const { error: deleteError } = await supabase
          .from('payments')
          .delete()
          .eq('session_id', session.id);

        if (deleteError) throw deleteError;
      }

      fetchSessions();
    } catch (error) {
      console.error('Error updating attendance:', error);
    }
  }

  async function markNoShow(session: Session) {
    try {
      const { error } = await supabase
        .from('sessions')
        .update({ status: 'no_show', attended: false })
        .eq('id', session.id);

      if (error) throw error;
      fetchSessions();
    } catch (error) {
      console.error('Error marking no-show:', error);
    }
  }

  function navigateDate(direction: 'prev' | 'next') {
    const current = parseISO(selectedDate);
    const newDate = new Date(current);
    newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
    setSelectedDate(format(newDate, 'yyyy-MM-dd'));
  }

  const isToday = selectedDate === getToday();
  const formattedDate = format(parseISO(selectedDate), 'EEEE, MMMM d');

  // Group sessions by hour for timeline view
  const sessionsByHour: Record<string, Session[]> = {};
  sessions.forEach((session) => {
    const hour = session.start_time.slice(0, 5);
    if (!sessionsByHour[hour]) sessionsByHour[hour] = [];
    sessionsByHour[hour].push(session);
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {isToday ? "Today's Schedule" : formattedDate}
          </h1>
          {!isToday && (
            <p className="text-sm text-muted-foreground">{formatDate(selectedDate)}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigateDate('prev')}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant={isToday ? 'default' : 'outline'}
            onClick={() => setSelectedDate(getToday())}
          >
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={() => navigateDate('next')}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Session
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{sessions.length}</div>
            <div className="text-sm text-muted-foreground">Sessions</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">
              {sessions.filter((s) => s.attended).length}
            </div>
            <div className="text-sm text-muted-foreground">Completed</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">
              {sessions.filter((s) => !s.attended && s.status !== 'no_show').length}
            </div>
            <div className="text-sm text-muted-foreground">Remaining</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">
              ${sessions.filter((s) => s.attended).length * 25}
            </div>
            <div className="text-sm text-muted-foreground">Earned Today</div>
          </CardContent>
        </Card>
      </div>

      {/* Sessions Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Schedule
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Spinner size="lg" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No sessions scheduled for this day</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setShowAddModal(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Session
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {Object.entries(sessionsByHour)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([hour, hourSessions]) => (
                  <div key={hour} className="flex gap-4">
                    <div className="w-16 flex-shrink-0 text-sm font-medium text-muted-foreground pt-3">
                      {formatTime(hour + ':00')}
                    </div>
                    <div className="flex-1 space-y-2">
                      {hourSessions.map((session) => (
                        <SessionCard
                          key={session.id}
                          session={session}
                          onToggleAttendance={toggleAttendance}
                          onMarkNoShow={markNoShow}
                          onClick={() => setSelectedSession(session)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Session Modal */}
      <AddSessionModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        date={selectedDate}
        onSuccess={fetchSessions}
      />

      {/* Session Detail Modal */}
      {selectedSession && (
        <SessionDetailModal
          session={selectedSession}
          onClose={() => setSelectedSession(null)}
          onUpdate={fetchSessions}
        />
      )}
    </div>
  );
}

// Session Card Component
interface SessionCardProps {
  session: Session;
  onToggleAttendance: (session: Session) => void;
  onMarkNoShow: (session: Session) => void;
  onClick: () => void;
}

function SessionCard({
  session,
  onToggleAttendance,
  onMarkNoShow,
  onClick,
}: SessionCardProps) {
  const config = workoutTypeConfig[session.workout_type];

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors hover:bg-accent/50 ${
        session.attended ? 'bg-green-50 border-green-200' : ''
      } ${session.status === 'no_show' ? 'bg-red-50 border-red-200 opacity-60' : ''}`}
      onClick={onClick}
    >
      <div className={`w-1 h-12 rounded-full ${config.bgColor}`} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">
            {session.member?.name || 'Unknown'}
          </span>
          <Badge variant="workout" workoutType={session.workout_type}>
            {config.label}
          </Badge>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatTime(session.start_time)}
          </span>
          {session.notes && (
            <span className="truncate text-xs">{session.notes}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        {session.status !== 'no_show' && (
          <>
            <Button
              variant={session.attended ? 'default' : 'outline'}
              size="icon"
              className="h-8 w-8"
              onClick={() => onToggleAttendance(session)}
            >
              <Check className="h-4 w-4" />
            </Button>
            {!session.attended && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive"
                onClick={() => onMarkNoShow(session)}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Add Session Modal
interface AddSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  date: string;
  onSuccess: () => void;
}

function AddSessionModal({ isOpen, onClose, date, onSuccess }: AddSessionModalProps) {
  const [members, setMembers] = useState<{ id: string; name: string; phone: string }[]>([]);
  const [conflictMessage, setConflictMessage] = useState('');
  const [error, setError] = useState('');
  const [requestKey, setRequestKey] = useState(createRequestKey);
  const [selectedMember, setSelectedMember] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [workoutType, setWorkoutType] = useState<WorkoutType>('push');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    if (isOpen) {
      setConflictMessage('');
      setError('');
      setRequestKey(createRequestKey());
      fetchMembers();
    }
  }, [isOpen]);

  async function fetchMembers() {
    const { data } = await supabase
      .from('members')
      .select('id, name, phone')
      .eq('is_active', true)
      .order('name');
    setMembers(data || []);
  }

  async function submitBooking(allowConflict = false) {
    if (!selectedMember) {
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/operator/bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          allowConflict,
          date,
          memberId: selectedMember,
          notes,
          requestKey,
          source: 'admin_dashboard',
          startTime,
          workoutType,
        }),
      });

      const payload = await response.json();

      if (response.status === 409) {
        setConflictMessage(payload.error || 'That time needs a quick review.');
        return;
      }

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to add session');
      }

      onSuccess();
      onClose();
      setConflictMessage('');
      setError('');
      setRequestKey(createRequestKey());
      setSelectedMember('');
      setNotes('');
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Failed to add session'
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submitBooking(false);
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Session">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Member</label>
          <Select
            value={selectedMember}
            onChange={(e) => {
              setSelectedMember(e.target.value);
              setConflictMessage('');
              setError('');
            }}
            required
          >
            <option value="">Select a member</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Time</label>
          <Input
            type="time"
            value={startTime}
            onChange={(e) => {
              setStartTime(e.target.value);
              setConflictMessage('');
              setError('');
            }}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Workout Type</label>
          <Select
            value={workoutType}
            onChange={(e) => {
              setWorkoutType(e.target.value as WorkoutType);
              setConflictMessage('');
              setError('');
            }}
          >
            <option value="push">Push (Chest)</option>
            <option value="pull">Pull (Arms)</option>
            <option value="legs">Legs</option>
            <option value="other">Other</option>
          </Select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Notes (optional)</label>
          <Input
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setConflictMessage('');
              setError('');
            }}
            placeholder="Any special notes..."
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {conflictMessage && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            {conflictMessage}
          </div>
        )}

        <div className="flex gap-2 justify-end pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {conflictMessage && (
            <Button
              type="button"
              variant="outline"
              onClick={() => submitBooking(true)}
              disabled={loading || !selectedMember}
            >
              {loading ? <Spinner size="sm" /> : 'Force Add Anyway'}
            </Button>
          )}
          <Button type="submit" disabled={loading || !selectedMember}>
            {loading ? <Spinner size="sm" /> : 'Add Session'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// Session Detail Modal
interface SessionDetailModalProps {
  session: Session;
  onClose: () => void;
  onUpdate: () => void;
}

function SessionDetailModal({ session, onClose, onUpdate }: SessionDetailModalProps) {
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  async function handleCancel() {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('sessions')
        .update({ status: 'cancelled' })
        .eq('id', session.id);

      if (error) throw error;
      onUpdate();
      onClose();
    } catch (error) {
      console.error('Error cancelling session:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal isOpen={true} onClose={onClose} title="Session Details">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="h-6 w-6 text-primary" />
          </div>
          <div>
            <div className="font-semibold text-lg">{session.member?.name}</div>
            <div className="text-sm text-muted-foreground">
              {session.member?.phone}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 py-4 border-y border-border">
          <div>
            <div className="text-sm text-muted-foreground">Date</div>
            <div className="font-medium">{formatDate(session.date)}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Time</div>
            <div className="font-medium">{formatTime(session.start_time)}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Workout</div>
            <Badge variant="workout" workoutType={session.workout_type}>
              {workoutTypeConfig[session.workout_type].label}
            </Badge>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Status</div>
            <div className="font-medium capitalize">{session.status}</div>
          </div>
        </div>

        {session.notes && (
          <div>
            <div className="text-sm text-muted-foreground">Notes</div>
            <div className="text-sm">{session.notes}</div>
          </div>
        )}

        <div className="flex gap-2 justify-end pt-4">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {session.status !== 'cancelled' && session.status !== 'completed' && (
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={loading}
            >
              {loading ? <Spinner size="sm" /> : 'Cancel Session'}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
