'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { format, addDays, startOfWeek, parseISO } from 'date-fns';
import { Clock, Plus, Trash2, Save, Calendar } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Availability } from '@/types/database';
import { getDayName, formatTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Modal } from '@/components/ui/modal';

const DAYS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

export default function AvailabilityManager() {
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    fetchAvailability();
  }, []);

  async function fetchAvailability() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('availability')
        .select('*')
        .order('day_of_week')
        .order('start_time');

      if (error) throw error;
      setAvailability(data || []);
    } catch (error) {
      console.error('Error fetching availability:', error);
    } finally {
      setLoading(false);
    }
  }

  async function deleteSlot(id: string) {
    try {
      const { error } = await supabase.from('availability').delete().eq('id', id);
      if (error) throw error;
      fetchAvailability();
    } catch (error) {
      console.error('Error deleting slot:', error);
    }
  }

  async function updateCapacity(id: string, capacity: number) {
    try {
      const { error } = await supabase
        .from('availability')
        .update({ max_capacity: capacity })
        .eq('id', id);
      if (error) throw error;
    } catch (error) {
      console.error('Error updating capacity:', error);
    }
  }

  // Group by day
  const availabilityByDay: Record<number, Availability[]> = {};
  availability.filter(a => a.is_recurring && !a.specific_date).forEach((slot) => {
    if (!availabilityByDay[slot.day_of_week]) {
      availabilityByDay[slot.day_of_week] = [];
    }
    availabilityByDay[slot.day_of_week].push(slot);
  });

  // Get blocked dates
  const blockedDates = availability.filter(a => a.specific_date && a.is_blocked);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Availability</h1>
          <p className="text-muted-foreground">Manage your weekly schedule</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowBlockModal(true)}>
            <Calendar className="h-4 w-4 mr-2" />
            Block Date
          </Button>
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Hours
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : (
        <>
          {/* Weekly Schedule Grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {DAYS.map((day) => (
              <Card key={day.value}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{day.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  {availabilityByDay[day.value]?.length ? (
                    <div className="space-y-2">
                      {availabilityByDay[day.value].map((slot) => (
                        <div
                          key={slot.id}
                          className="flex items-center justify-between rounded-lg bg-accent/50 px-3 py-2"
                        >
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">
                              {formatTime(slot.start_time)} - {formatTime(slot.end_time)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Select
                              className="h-8 w-16 text-xs"
                              value={slot.max_capacity.toString()}
                              onChange={(e) =>
                                updateCapacity(slot.id, parseInt(e.target.value))
                              }
                            >
                              {[1, 2, 3, 4, 5].map((n) => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ))}
                            </Select>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              onClick={() => deleteSlot(slot.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No hours set
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Blocked Dates */}
          {blockedDates.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Blocked Dates</CardTitle>
                <CardDescription>Days you&apos;re unavailable</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {blockedDates.map((block) => (
                    <div
                      key={block.id}
                      className="flex items-center gap-2 rounded-full bg-destructive/10 px-3 py-1 text-sm"
                    >
                      <span>{format(parseISO(block.specific_date!), 'MMM d, yyyy')}</span>
                      <button
                        onClick={() => deleteSlot(block.id)}
                        className="text-destructive hover:text-destructive/80"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Add Availability Modal */}
      <AddAvailabilityModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={fetchAvailability}
      />

      {/* Block Date Modal */}
      <BlockDateModal
        isOpen={showBlockModal}
        onClose={() => setShowBlockModal(false)}
        onSuccess={fetchAvailability}
      />
    </div>
  );
}

// Add Availability Modal
interface AddAvailabilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function AddAvailabilityModal({ isOpen, onClose, onSuccess }: AddAvailabilityModalProps) {
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [startTime, setStartTime] = useState('06:00');
  const [endTime, setEndTime] = useState('12:00');
  const [maxCapacity, setMaxCapacity] = useState(1);
  const [loading, setLoading] = useState(false);

  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.from('availability').insert({
        day_of_week: dayOfWeek,
        start_time: startTime + ':00',
        end_time: endTime + ':00',
        is_recurring: true,
        max_capacity: maxCapacity,
      });

      if (error) throw error;
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error adding availability:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Available Hours">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Day</label>
          <Select
            value={dayOfWeek.toString()}
            onChange={(e) => setDayOfWeek(parseInt(e.target.value))}
          >
            {DAYS.map((day) => (
              <option key={day.value} value={day.value}>
                {day.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Start Time</label>
            <Input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">End Time</label>
            <Input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Max Capacity per Hour</label>
          <Select
            value={maxCapacity.toString()}
            onChange={(e) => setMaxCapacity(parseInt(e.target.value))}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? 'person' : 'people'}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex gap-2 justify-end pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? <Spinner size="sm" /> : 'Add Hours'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// Block Date Modal
interface BlockDateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function BlockDateModal({ isOpen, onClose, onSuccess }: BlockDateModalProps) {
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(false);

  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!date) return;

    setLoading(true);
    try {
      const { error } = await supabase.from('availability').insert({
        specific_date: date,
        is_blocked: true,
        is_recurring: false,
        day_of_week: new Date(date).getDay(),
        start_time: '00:00:00',
        end_time: '23:59:59',
        max_capacity: 0,
      });

      if (error) throw error;
      onSuccess();
      onClose();
      setDate('');
    } catch (error) {
      console.error('Error blocking date:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Block a Date">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Date to Block</label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            min={format(new Date(), 'yyyy-MM-dd')}
            required
          />
        </div>

        <p className="text-sm text-muted-foreground">
          This will prevent any bookings on this date.
        </p>

        <div className="flex gap-2 justify-end pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading || !date}>
            {loading ? <Spinner size="sm" /> : 'Block Date'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
