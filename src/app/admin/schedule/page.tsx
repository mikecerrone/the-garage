'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { format, parseISO, startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, subWeeks } from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Session } from '@/types/database';
import { formatTime, workoutTypeConfig, getToday } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';

export default function SchedulePage() {
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 0 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  useEffect(() => {
    fetchSessions();
  }, [currentWeek]);

  async function fetchSessions() {
    setLoading(true);
    try {
      const startDate = format(weekStart, 'yyyy-MM-dd');
      const endDate = format(weekEnd, 'yyyy-MM-dd');

      const { data, error } = await supabase
        .from('sessions')
        .select(`
          *,
          member:members(name)
        `)
        .gte('date', startDate)
        .lte('date', endDate)
        .neq('status', 'cancelled')
        .order('date')
        .order('start_time');

      if (error) throw error;
      setSessions(data || []);
    } catch (error) {
      console.error('Error fetching sessions:', error);
    } finally {
      setLoading(false);
    }
  }

  // Group sessions by date
  const sessionsByDate: Record<string, Session[]> = {};
  sessions.forEach((session) => {
    if (!sessionsByDate[session.date]) sessionsByDate[session.date] = [];
    sessionsByDate[session.date].push(session);
  });

  const today = getToday();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Schedule</h1>
          <p className="text-muted-foreground">
            {format(weekStart, 'MMM d')} - {format(weekEnd, 'MMM d, yyyy')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={() => setCurrentWeek(new Date())}>
            This Week
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : (
        /* Week Grid */
        <div className="grid gap-4 md:grid-cols-7">
          {weekDays.map((day) => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const daySessions = sessionsByDate[dateStr] || [];
            const isToday = dateStr === today;
            const isPast = dateStr < today;

            return (
              <Card
                key={dateStr}
                className={`${isToday ? 'ring-2 ring-primary' : ''} ${
                  isPast ? 'opacity-60' : ''
                }`}
              >
                <CardHeader className="p-3 pb-1">
                  <CardTitle
                    className={`text-sm flex items-center justify-between ${
                      isToday ? 'text-primary' : ''
                    }`}
                  >
                    <span>{format(day, 'EEE')}</span>
                    <span
                      className={`text-lg ${
                        isToday
                          ? 'bg-primary text-primary-foreground rounded-full w-8 h-8 flex items-center justify-center'
                          : ''
                      }`}
                    >
                      {format(day, 'd')}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-1">
                  {daySessions.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      No sessions
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {daySessions.map((session) => {
                        const config = workoutTypeConfig[session.workout_type];
                        return (
                          <div
                            key={session.id}
                            className={`rounded px-2 py-1 text-xs ${config.bgColor}`}
                          >
                            <div className="font-medium truncate">
                              {session.member?.name || 'Unknown'}
                            </div>
                            <div className={`${config.color} opacity-80`}>
                              {formatTime(session.start_time)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Week Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Week Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <div className="text-2xl font-bold">{sessions.length}</div>
              <div className="text-sm text-muted-foreground">Total Sessions</div>
            </div>
            <div>
              <div className="text-2xl font-bold">
                {sessions.filter((s) => s.attended).length}
              </div>
              <div className="text-sm text-muted-foreground">Completed</div>
            </div>
            <div>
              <div className="text-2xl font-bold">
                {new Set(sessions.map((s) => s.member_id)).size}
              </div>
              <div className="text-sm text-muted-foreground">Unique Members</div>
            </div>
            <div>
              <div className="text-2xl font-bold">
                ${sessions.filter((s) => s.attended).length * 50}
              </div>
              <div className="text-sm text-muted-foreground">Revenue</div>
            </div>
          </div>

          {/* Workout type breakdown */}
          <div className="mt-4 pt-4 border-t border-border">
            <h4 className="text-sm font-medium mb-2">By Workout Type</h4>
            <div className="flex flex-wrap gap-2">
              {(['push', 'pull', 'legs', 'other'] as const).map((type) => {
                const count = sessions.filter(
                  (s) => s.workout_type === type
                ).length;
                if (count === 0) return null;
                return (
                  <Badge key={type} variant="workout" workoutType={type}>
                    {workoutTypeConfig[type].label}: {count}
                  </Badge>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
