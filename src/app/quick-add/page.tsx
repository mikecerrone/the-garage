'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Calendar,
  Clock,
  LogOut,
  Search,
  UserPlus,
} from 'lucide-react';
import type { Session, TimeSlot, WorkoutType } from '@/types/database';
import { formatDateFull, formatPhone, formatTime, getToday, getTomorrow } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';

interface MemberSearchResult {
  id: string;
  isExactMatch: boolean;
  matchKind: string;
  name: string;
  phone: string;
}

interface AvailabilityResponse {
  slots: TimeSlot[];
}

interface SavedBooking {
  memberName: string;
  session: Session;
}

const workoutOptions: Array<{ label: string; value: WorkoutType }> = [
  { label: 'Push', value: 'push' },
  { label: 'Pull', value: 'pull' },
  { label: 'Legs', value: 'legs' },
  { label: 'Other', value: 'other' },
];
const DEFAULT_CUSTOM_TIME = '09:00';
const CUSTOM_TIME_STEP_SECONDS = 15 * 60;

function createRequestKey() {
  if (typeof window !== 'undefined' && typeof window.crypto?.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }

  return `quick-add-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function groupSlotsByDate(slots: TimeSlot[]) {
  return slots.reduce<Record<string, TimeSlot[]>>((accumulator, slot) => {
    const key = slot.date;
    accumulator[key] = accumulator[key] || [];
    accumulator[key].push(slot);
    return accumulator;
  }, {});
}

export default function QuickAddPage() {
  const router = useRouter();
  const today = getToday();
  const tomorrow = getTomorrow();
  const [availabilityByDate, setAvailabilityByDate] = useState<Record<string, TimeSlot[]>>({});
  const [availabilityError, setAvailabilityError] = useState('');
  const [availabilityLoading, setAvailabilityLoading] = useState(true);
  const [conflictError, setConflictError] = useState('');
  const [customTime, setCustomTime] = useState(DEFAULT_CUSTOM_TIME);
  const [generalError, setGeneralError] = useState('');
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [newMemberFirstName, setNewMemberFirstName] = useState('');
  const [newMemberPhone, setNewMemberPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [requestKey, setRequestKey] = useState(createRequestKey);
  const [savedBooking, setSavedBooking] = useState<SavedBooking | null>(null);
  const [searchError, setSearchError] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MemberSearchResult[]>([]);
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedMember, setSelectedMember] = useState<MemberSearchResult | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [showCustomDate, setShowCustomDate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [workoutType, setWorkoutType] = useState<WorkoutType | null>(null);

  const selectedDateSlots = availabilityByDate[selectedDate] || [];
  const showNewMemberForm =
    !selectedMember &&
    searchQuery.trim().length >= 2 &&
    !searchLoading &&
    searchResults.length === 0;

  const canSave = useMemo(() => {
    const hasMember = selectedMember || (newMemberFirstName.trim() && newMemberPhone.trim());
    return Boolean(hasMember && (selectedSlot || customTime));
  }, [customTime, newMemberFirstName, newMemberPhone, selectedMember, selectedSlot]);

  useEffect(() => {
    void fetchInitialAvailability();
  }, []);

  useEffect(() => {
    if (selectedDate && !availabilityByDate[selectedDate]) {
      void fetchAvailabilityForDate(selectedDate);
    }
  }, [availabilityByDate, selectedDate]);

  useEffect(() => {
    if (selectedMember) {
      return;
    }

    const query = searchQuery.trim();
    if (query.length < 2) {
      setSearchResults([]);
      setSearchError('');
      setSearchLoading(false);
      return;
    }

    const timeout = window.setTimeout(async () => {
      setSearchLoading(true);
      setSearchError('');

      try {
        const response = await fetch(
          `/api/operator/members/search?q=${encodeURIComponent(query)}`
        );
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || 'Search is unavailable right now.');
        }

        setSearchResults(payload.members || []);
      } catch (error) {
        setSearchResults([]);
        setSearchError(
          error instanceof Error ? error.message : 'Search is unavailable right now.'
        );
      } finally {
        setSearchLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [searchQuery, selectedMember]);

  async function fetchInitialAvailability() {
    setAvailabilityLoading(true);
    setAvailabilityError('');

    try {
      const response = await fetch('/api/availability?days=2');
      const payload: AvailabilityResponse = await response.json();

      if (!response.ok) {
        throw new Error('Suggested times are unavailable right now.');
      }

      setAvailabilityByDate(groupSlotsByDate(payload.slots || []));
    } catch (error) {
      setAvailabilityError(
        error instanceof Error
          ? error.message
          : 'Suggested times are unavailable right now.'
      );
    } finally {
      setAvailabilityLoading(false);
    }
  }

  async function fetchAvailabilityForDate(date: string) {
    setAvailabilityLoading(true);
    setAvailabilityError('');

    try {
      const response = await fetch(`/api/availability?date=${encodeURIComponent(date)}`);
      const payload: AvailabilityResponse = await response.json();

      if (!response.ok) {
        throw new Error('Suggested times are unavailable right now.');
      }

      setAvailabilityByDate((current) => ({
        ...current,
        [date]: payload.slots || [],
      }));
    } catch (error) {
      setAvailabilityError(
        error instanceof Error
          ? error.message
          : 'Suggested times are unavailable right now.'
      );
    } finally {
      setAvailabilityLoading(false);
    }
  }

  async function handleSignOut() {
    setIsSigningOut(true);

    try {
      await fetch('/api/operator/logout', {
        method: 'POST',
      });
    } finally {
      router.push('/operator-login');
      router.refresh();
      setIsSigningOut(false);
    }
  }

  function resetForNextBooking() {
    setConflictError('');
    setCustomTime(DEFAULT_CUSTOM_TIME);
    setGeneralError('');
    setNewMemberFirstName('');
    setNewMemberPhone('');
    setNotes('');
    setRequestKey(createRequestKey());
    setSavedBooking(null);
    setSearchError('');
    setSearchQuery('');
    setSearchResults([]);
    setSelectedMember(null);
    setSelectedSlot(null);
    setWorkoutType(null);
  }

  async function saveBooking(allowConflict = false) {
    if (!canSave || submitting) {
      return;
    }

    setSubmitting(true);
    setConflictError('');
    setGeneralError('');

    try {
      const response = await fetch('/api/operator/bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          allowConflict,
          date: selectedDate,
          firstName: selectedMember ? undefined : newMemberFirstName.trim(),
          memberId: selectedMember?.id,
          notes,
          phone: selectedMember ? undefined : newMemberPhone.trim(),
          requestKey,
          source: 'quick_add',
          startTime: selectedSlot?.start_time || customTime,
          workoutType: workoutType || undefined,
        }),
      });

      const payload = await response.json();

      if (response.status === 409) {
        setConflictError(payload.error || 'That time needs a quick review before saving.');
        return;
      }

      if (!response.ok) {
        throw new Error(payload.error || 'Booking not saved. Try again.');
      }

      setSavedBooking({
        memberName: payload.member.name,
        session: payload.session,
      });
      setRequestKey(createRequestKey());
    } catch (error) {
      setGeneralError(
        error instanceof Error ? error.message : 'Booking not saved. Try again.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Bob Mode
            </p>
            <h1 className="text-2xl font-bold">Quick Add</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push('/admin')}>
              Dashboard
            </Button>
            <Button variant="ghost" size="sm" onClick={handleSignOut} disabled={isSigningOut}>
              <LogOut className="mr-2 h-4 w-4" />
              {isSigningOut ? 'Signing out...' : 'Sign out'}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Find or add a member
            </CardTitle>
            <CardDescription>
              Search by name or phone. If nothing matches, add a first name and phone.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label htmlFor="quick-add-search" className="mb-1 block text-sm font-medium">
                Search
              </label>
              <Input
                id="quick-add-search"
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setSearchResults([]);
                  setSelectedMember(null);
                  setConflictError('');
                  setGeneralError('');
                }}
                placeholder="Mike or 615-555-1212"
                autoComplete="off"
              />
            </div>

            {selectedMember && (
              <div className="rounded-xl border border-border bg-accent/30 p-4">
                <p className="text-sm text-muted-foreground">Using member</p>
                <p className="font-semibold">{selectedMember.name}</p>
                <p className="text-sm text-muted-foreground">
                  {formatPhone(selectedMember.phone)}
                </p>
              </div>
            )}

            {searchLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner size="sm" />
                Looking up members...
              </div>
            )}

            {searchError && <p className="text-sm text-destructive">{searchError}</p>}

            {!selectedMember && searchResults.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Pick the right member</p>
                {searchResults.map((member) => (
                  <button
                    type="button"
                    key={member.id}
                    className="flex w-full items-center justify-between rounded-xl border border-border px-4 py-3 text-left transition-colors hover:bg-accent/40"
                    onClick={() => {
                      setSelectedMember(member);
                      setSearchQuery(`${member.name} ${formatPhone(member.phone)}`);
                      setSearchResults([]);
                      setConflictError('');
                    }}
                  >
                    <div>
                      <p className="font-medium">{member.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatPhone(member.phone)}
                      </p>
                    </div>
                    {member.isExactMatch && (
                      <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                        Exact
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {showNewMemberForm && (
              <div className="space-y-3 rounded-xl border border-dashed border-border p-4">
                <div className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-primary" />
                  <p className="font-medium">No match found. Add a new member.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="quick-add-first-name" className="mb-1 block text-sm font-medium">
                      First name
                    </label>
                    <Input
                      id="quick-add-first-name"
                      value={newMemberFirstName}
                      onChange={(event) => setNewMemberFirstName(event.target.value)}
                      placeholder="Bob"
                    />
                  </div>
                  <div>
                    <label htmlFor="quick-add-phone" className="mb-1 block text-sm font-medium">
                      Phone
                    </label>
                    <Input
                      id="quick-add-phone"
                      type="tel"
                      value={newMemberPhone}
                      onChange={(event) => setNewMemberPhone(event.target.value)}
                      placeholder="(615) 555-1212"
                    />
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Pick the day and time
            </CardTitle>
            <CardDescription>
              Suggested slots come from Bob&apos;s schedule. Custom time is always available.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                variant={selectedDate === today ? 'default' : 'outline'}
                onClick={() => {
                  setSelectedDate(today);
                  setSelectedSlot(null);
                  setConflictError('');
                }}
              >
                Today
              </Button>
              <Button
                variant={selectedDate === tomorrow ? 'default' : 'outline'}
                onClick={() => {
                  setSelectedDate(tomorrow);
                  setSelectedSlot(null);
                  setConflictError('');
                }}
              >
                Tomorrow
              </Button>
              <Button
                variant={showCustomDate ? 'default' : 'outline'}
                onClick={() => setShowCustomDate((current) => !current)}
              >
                More days
              </Button>
            </div>

            {showCustomDate && (
              <div>
                <label htmlFor="quick-add-date" className="mb-1 block text-sm font-medium">
                  Choose a date
                </label>
                <Input
                  id="quick-add-date"
                  type="date"
                  value={selectedDate}
                  onChange={(event) => {
                    setSelectedDate(event.target.value);
                    setSelectedSlot(null);
                    setConflictError('');
                  }}
                />
              </div>
            )}

            <div className="rounded-xl border border-border bg-secondary/40 p-4">
              <p className="text-sm text-muted-foreground">Selected day</p>
              <p className="font-semibold">{formatDateFull(selectedDate)}</p>
            </div>

            {availabilityLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner size="sm" />
                Loading suggested times...
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Clock className="h-4 w-4 text-primary" />
                  Suggested times
                </div>
                {selectedDateSlots.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {selectedDateSlots.map((slot) => {
                      const isSelected = selectedSlot?.date === slot.date &&
                        selectedSlot.start_time === slot.start_time;

                      return (
                        <Button
                          key={`${slot.date}-${slot.start_time}`}
                          variant={isSelected ? 'default' : 'outline'}
                          className="justify-between"
                          onClick={() => {
                            setSelectedSlot(slot);
                            setConflictError('');
                          }}
                        >
                          <span>{formatTime(slot.start_time)}</span>
                          <span className="text-xs opacity-80">
                            {slot.available_spots} left
                          </span>
                        </Button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No suggested times for this day. You can still type a custom time below.
                  </p>
                )}

                {availabilityError && (
                  <p className="text-sm text-destructive">{availabilityError}</p>
                )}
              </div>
            )}

            <div className="rounded-xl border border-dashed border-border p-4">
              <div>
                <label htmlFor="quick-add-custom-time" className="mb-1 block text-sm font-medium">
                  Custom time
                </label>
                <Input
                  id="quick-add-custom-time"
                  type="time"
                  value={customTime}
                  step={CUSTOM_TIME_STEP_SECONDS}
                  onFocus={() => {
                    setSelectedSlot(null);
                    setConflictError('');
                  }}
                  onChange={(event) => {
                    setCustomTime(event.target.value);
                    setSelectedSlot(null);
                    setConflictError('');
                  }}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Starts at 9:00 AM and snaps to 15-minute intervals.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Workout</label>
                <p className="text-xs text-muted-foreground">
                  Optional. Tap a button to pick one, or tap it again to clear.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Workout">
                {workoutOptions.map((option) => {
                  const isSelected = workoutType === option.value;

                  return (
                    <Button
                      key={option.value}
                      type="button"
                      variant={isSelected ? 'default' : 'outline'}
                      aria-pressed={isSelected}
                      className="w-full"
                      onClick={() => {
                        setWorkoutType((current) =>
                          current === option.value ? null : option.value
                        );
                      }}
                    >
                      {option.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div>
              <label htmlFor="quick-add-notes" className="mb-1 block text-sm font-medium">
                Notes (optional)
              </label>
              <Input
                id="quick-add-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Anything Bob should remember"
              />
            </div>
          </CardContent>
        </Card>

        {savedBooking ? (
          <Card className="border-primary/30">
            <CardHeader>
              <CardTitle>Booked</CardTitle>
              <CardDescription>
                {savedBooking.memberName} is locked in for{' '}
                {formatDateFull(savedBooking.session.date)} at{' '}
                {formatTime(savedBooking.session.start_time)}.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row">
              <Button onClick={resetForNextBooking}>Add another</Button>
              <Button
                variant="outline"
                onClick={() => router.push(`/admin?date=${savedBooking.session.date}`)}
              >
                View details
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="space-y-4 p-4">
              {generalError && <p className="text-sm text-destructive">{generalError}</p>}
              {conflictError && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                  <p className="font-medium">That time needs a quick review.</p>
                  <p className="mt-1">{conflictError}</p>
                </div>
              )}
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button className="sm:flex-1" disabled={!canSave || submitting} onClick={() => saveBooking(false)}>
                  {submitting ? <Spinner size="sm" /> : 'Save booking'}
                </Button>
                {conflictError && (
                  <Button
                    variant="outline"
                    className="sm:flex-1"
                    disabled={submitting}
                    onClick={() => saveBooking(true)}
                  >
                    Force add anyway
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <p className="text-center text-sm text-muted-foreground">
          Need the full admin tools?{' '}
          <Link href="/admin" className="text-primary hover:underline">
            Open the dashboard
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
