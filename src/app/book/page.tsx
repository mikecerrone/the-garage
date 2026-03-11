'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { format, parseISO, addDays } from 'date-fns';
import {
  Calendar,
  Clock,
  Dumbbell,
  Phone,
  ArrowRight,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { TimeSlot, Session, WorkoutType, Member } from '@/types/database';
import { formatTime, formatDate, workoutTypeConfig, formatPhone } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Modal } from '@/components/ui/modal';

type BookingStep = 'phone' | 'select' | 'confirm' | 'success';

export default function BookingPage() {
  const [step, setStep] = useState<BookingStep>('phone');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [member, setMember] = useState<Member | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [selectedWorkout, setSelectedWorkout] = useState<WorkoutType | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [weekOffset, setWeekOffset] = useState(0);

  // Group slots by date
  const slotsByDate: Record<string, TimeSlot[]> = {};
  slots.forEach((slot) => {
    if (!slotsByDate[slot.date]) slotsByDate[slot.date] = [];
    slotsByDate[slot.date].push(slot);
  });

  const dates = Object.keys(slotsByDate).sort();

  async function handlePhoneSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Check if member exists and get their sessions
      const res = await fetch(`/api/sessions?phone=${encodeURIComponent(phone)}`);
      const data = await res.json();

      if (data.member) {
        setMember(data.member);
        setName(data.member.name);
      }
      setSessions(data.sessions || []);

      // Fetch available slots
      const slotsRes = await fetch('/api/availability?days=14');
      const slotsData = await slotsRes.json();
      setSlots(slotsData.slots || []);

      setStep('select');
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleBooking() {
    if (!selectedSlot || !selectedWorkout) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          name: name || 'Neighbor',
          date: selectedSlot.date,
          start_time: selectedSlot.start_time,
          workout_type: selectedWorkout,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to book session');
        return;
      }

      setStep('success');
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel(sessionId: string) {
    if (!confirm('Cancel this session?')) return;

    try {
      const res = await fetch(`/api/sessions?id=${sessionId}&phone=${encodeURIComponent(phone)}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setSessions(sessions.filter((s) => s.id !== sessionId));
      }
    } catch (err) {
      console.error('Error cancelling:', err);
    }
  }

  function resetBooking() {
    setStep('phone');
    setSelectedSlot(null);
    setSelectedWorkout(null);
    setSelectedDate('');
    setError('');
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-lg mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-primary">THE GARAGE</h1>
          <p className="text-sm text-muted-foreground">Book your workout</p>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6">
        {/* Phone Entry Step */}
        {step === 'phone' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Phone className="h-5 w-5" />
                Enter your phone number
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePhoneSubmit} className="space-y-4">
                <div>
                  <Input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                    className="text-lg"
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    We use your phone number to track your bookings
                  </p>
                </div>

                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}

                <Button type="submit" className="w-full" disabled={loading || !phone}>
                  {loading ? <Spinner size="sm" /> : (
                    <>
                      Continue
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </>
                  )}
                </Button>
              </form>

              <div className="mt-6 pt-6 border-t border-border text-center">
                <p className="text-sm text-muted-foreground mb-2">Prefer to text?</p>
                <p className="text-sm font-medium">
                  Text <span className="text-primary">{process.env.NEXT_PUBLIC_TWILIO_PHONE || 'Bob'}</span> to book via SMS
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Selection Step */}
        {step === 'select' && (
          <div className="space-y-6">
            {/* Member greeting */}
            {member && (
              <div className="text-center">
                <p className="text-lg">
                  Hey <span className="font-semibold">{member.name.split(' ')[0]}</span>!
                </p>
              </div>
            )}

            {/* Existing bookings */}
            {sessions.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Your Upcoming Sessions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {sessions.map((session) => (
                      <div
                        key={session.id}
                        className="flex items-center justify-between rounded-lg bg-accent/50 px-3 py-2"
                      >
                        <div>
                          <div className="font-medium">{formatDate(session.date)}</div>
                          <div className="text-sm text-muted-foreground flex items-center gap-2">
                            <Clock className="h-3 w-3" />
                            {formatTime(session.start_time)}
                            <Badge variant="workout" workoutType={session.workout_type}>
                              {workoutTypeConfig[session.workout_type].label}
                            </Badge>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => handleCancel(session.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Available slots */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Available Times
                </CardTitle>
              </CardHeader>
              <CardContent>
                {dates.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No available slots right now. Check back later!
                  </p>
                ) : (
                  <div className="space-y-4">
                    {dates.map((date) => (
                      <div key={date}>
                        <h3 className="font-medium mb-2">
                          {format(parseISO(date), 'EEEE, MMM d')}
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {slotsByDate[date].map((slot) => (
                            <button
                              key={`${slot.date}-${slot.start_time}`}
                              onClick={() => {
                                setSelectedSlot(slot);
                                setSelectedDate(date);
                              }}
                              className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                                selectedSlot?.date === slot.date &&
                                selectedSlot?.start_time === slot.start_time
                                  ? 'border-primary bg-primary text-primary-foreground'
                                  : 'border-border hover:border-primary hover:bg-accent'
                              }`}
                            >
                              {formatTime(slot.start_time)}
                              {slot.available_spots > 1 && (
                                <span className="text-xs opacity-70 ml-1">
                                  ({slot.available_spots})
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Workout type selection */}
            {selectedSlot && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Dumbbell className="h-5 w-5" />
                    What are you training?
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3">
                    {(['push', 'pull', 'legs', 'other'] as WorkoutType[]).map((type) => {
                      const config = workoutTypeConfig[type];
                      return (
                        <button
                          key={type}
                          onClick={() => setSelectedWorkout(type)}
                          className={`p-4 rounded-lg border text-left transition-colors ${
                            selectedWorkout === type
                              ? 'border-primary bg-primary/10'
                              : 'border-border hover:border-primary hover:bg-accent'
                          }`}
                        >
                          <div className={`font-medium ${config.color}`}>
                            {config.label}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Name input for new members */}
            {selectedSlot && selectedWorkout && !member && (
              <Card>
                <CardHeader>
                  <CardTitle>What's your name?</CardTitle>
                </CardHeader>
                <CardContent>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                  />
                </CardContent>
              </Card>
            )}

            {/* Confirm button */}
            {selectedSlot && selectedWorkout && (
              <div className="space-y-3">
                {error && (
                  <p className="text-sm text-destructive text-center">{error}</p>
                )}
                <Button
                  className="w-full"
                  size="lg"
                  onClick={handleBooking}
                  disabled={loading}
                >
                  {loading ? (
                    <Spinner size="sm" />
                  ) : (
                    <>
                      Book {formatDate(selectedSlot.date)} at{' '}
                      {formatTime(selectedSlot.start_time)}
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    setSelectedSlot(null);
                    setSelectedWorkout(null);
                  }}
                >
                  Change selection
                </Button>
              </div>
            )}

            {/* Back button */}
            <Button variant="outline" className="w-full" onClick={resetBooking}>
              <ChevronLeft className="h-4 w-4 mr-2" />
              Start over
            </Button>
          </div>
        )}

        {/* Success Step */}
        {step === 'success' && selectedSlot && selectedWorkout && (
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <Check className="h-8 w-8 text-green-600" />
              </div>
              <h2 className="text-xl font-bold mb-2">You're booked!</h2>
              <p className="text-muted-foreground mb-6">
                See you at The Garage
              </p>

              <div className="bg-accent rounded-lg p-4 text-left space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Date</span>
                  <span className="font-medium">
                    {format(parseISO(selectedSlot.date), 'EEEE, MMM d')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Time</span>
                  <span className="font-medium">
                    {formatTime(selectedSlot.start_time)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Workout</span>
                  <Badge variant="workout" workoutType={selectedWorkout}>
                    {workoutTypeConfig[selectedWorkout].label}
                  </Badge>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                <Button className="w-full" onClick={resetBooking}>
                  Book another session
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-auto">
        <div className="max-w-lg mx-auto px-4 py-4 text-center text-sm text-muted-foreground">
          <p>The Garage — Bob's Neighborhood Gym</p>
        </div>
      </footer>
    </div>
  );
}
