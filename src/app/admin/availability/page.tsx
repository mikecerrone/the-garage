'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { format, addDays, startOfWeek, parseISO } from 'date-fns';
import { Clock, Plus, Trash2, Save, Calendar, Copy, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Availability } from '@/types/database';
import { getDayName, formatTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Modal } from '@/components/ui/modal';
import { Badge } from '@/components/ui/badge';

const DAYS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

type SlotPreset = 'morning' | 'evening' | 'custom';

const NO_LIMIT = 999;

const CAPACITY_OPTIONS = [
  { value: NO_LIMIT, label: 'No limit' },
  { value: 8, label: '8 people' },
  { value: 9, label: '9 people' },
  { value: 10, label: '10 people' },
  { value: 11, label: '11 people' },
  { value: 12, label: '12 people' },
  { value: 13, label: '13 people' },
  { value: 14, label: '14 people' },
  { value: 15, label: '15 people' },
];

function formatCapacity(capacity: number) {
  return capacity >= NO_LIMIT ? 'No limit' : `${capacity}`;
}

export default function AvailabilityManager() {
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [applyingWeek, setApplyingWeek] = useState(false);
  const [appliedSuccess, setAppliedSuccess] = useState(false);

  // Week navigation for "Apply Template" section
  const [selectedWeekStart, setSelectedWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );

  const supabase = createClient();

  const fetchAvailability = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    fetchAvailability();
  }, [fetchAvailability]);

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

  // Template = recurring slots (no specific_date)
  const templateSlots = availability.filter(a => a.is_recurring && !a.specific_date);
  const templateByDay: Record<number, Availability[]> = {};
  templateSlots.forEach((slot) => {
    if (!templateByDay[slot.day_of_week]) {
      templateByDay[slot.day_of_week] = [];
    }
    templateByDay[slot.day_of_week].push(slot);
  });

  // Applied week slots (specific_date, not blocked)
  const appliedSlots = availability.filter(a => a.specific_date && !a.is_blocked);

  // Check which dates in the selected week have applied slots
  const selectedWeekDates = Array.from({ length: 7 }, (_, i) =>
    format(addDays(selectedWeekStart, i), 'yyyy-MM-dd')
  );
  const appliedForSelectedWeek = appliedSlots.filter(s =>
    selectedWeekDates.includes(s.specific_date!)
  );
  const appliedByDate: Record<string, Availability[]> = {};
  appliedForSelectedWeek.forEach((slot) => {
    const d = slot.specific_date!;
    if (!appliedByDate[d]) appliedByDate[d] = [];
    appliedByDate[d].push(slot);
  });

  const weekHasApplied = appliedForSelectedWeek.length > 0;

  // Blocked dates
  const blockedDates = availability.filter(a => a.specific_date && a.is_blocked);

  async function applyTemplateToWeek() {
    setApplyingWeek(true);
    setAppliedSuccess(false);
    try {
      // Remove existing applied slots for this week (non-blocked)
      const { error: deleteError } = await supabase
        .from('availability')
        .delete()
        .in('specific_date', selectedWeekDates)
        .eq('is_blocked', false)
        .eq('is_recurring', false);

      if (deleteError) throw deleteError;

      // Copy template slots into each day of the selected week
      const inserts: Array<{
        day_of_week: number;
        start_time: string;
        end_time: string;
        is_recurring: boolean;
        specific_date: string;
        is_blocked: boolean;
        max_capacity: number;
      }> = [];

      for (let i = 0; i < 7; i++) {
        const date = selectedWeekDates[i];
        const dayOfWeek = addDays(selectedWeekStart, i).getDay();
        const daySlots = templateByDay[dayOfWeek] || [];

        for (const slot of daySlots) {
          inserts.push({
            day_of_week: dayOfWeek,
            start_time: slot.start_time,
            end_time: slot.end_time,
            is_recurring: false,
            specific_date: date,
            is_blocked: false,
            max_capacity: slot.max_capacity,
          });
        }
      }

      if (inserts.length > 0) {
        const { error: insertError } = await supabase.from('availability').insert(inserts);
        if (insertError) throw insertError;
      }

      setAppliedSuccess(true);
      setTimeout(() => setAppliedSuccess(false), 3000);
      fetchAvailability();
    } catch (error) {
      console.error('Error applying template:', error);
    } finally {
      setApplyingWeek(false);
    }
  }

  async function clearWeek() {
    try {
      const { error } = await supabase
        .from('availability')
        .delete()
        .in('specific_date', selectedWeekDates)
        .eq('is_blocked', false)
        .eq('is_recurring', false);

      if (error) throw error;
      fetchAvailability();
    } catch (error) {
      console.error('Error clearing week:', error);
    }
  }

  function navigateWeek(direction: number) {
    setSelectedWeekStart(prev => addDays(prev, direction * 7));
  }

  const weekLabel = `${format(selectedWeekStart, 'MMM d')} – ${format(addDays(selectedWeekStart, 6), 'MMM d, yyyy')}`;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Availability</h1>
          <p className="text-muted-foreground">Manage your weekly template and schedule</p>
        </div>
        <Button variant="outline" onClick={() => setShowBlockModal(true)}>
          <Calendar className="h-4 w-4 mr-2" />
          Block Date
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : (
        <>
          {/* ── Weekly Template ── */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold">Weekly Template</h2>
                <p className="text-sm text-muted-foreground">
                  Your default schedule. Edit here, then apply to individual weeks.
                </p>
              </div>
              <Button onClick={() => setShowAddModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Hours
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              {DAYS.map((day) => (
                <Card key={day.value} className="min-w-0">
                  <CardHeader className="pb-2 px-3 pt-3">
                    <CardTitle className="text-sm">{day.label}</CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 pb-3">
                    {templateByDay[day.value]?.length ? (
                      <div className="space-y-1.5">
                        {templateByDay[day.value].map((slot) => (
                          <div
                            key={slot.id}
                            className="flex items-center justify-between rounded-md bg-accent/50 px-2 py-1.5 text-xs"
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                              <span className="truncate">
                                {formatTime(slot.start_time)} – {formatTime(slot.end_time)}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Select
                                className="h-6 w-[70px] text-[10px] px-1"
                                value={slot.max_capacity.toString()}
                                onChange={(e) =>
                                  updateCapacity(slot.id, parseInt(e.target.value))
                                }
                              >
                                {CAPACITY_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </Select>
                              <button
                                className="text-destructive hover:text-destructive/80 p-0.5"
                                onClick={() => deleteSlot(slot.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground text-center py-3">
                        Off
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {/* ── Apply Template to Week ── */}
          <section>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold">Schedule a Week</h2>
                <p className="text-sm text-muted-foreground">
                  Apply your template to a specific week. You can tweak individual days after applying.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={() => navigateWeek(-1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium min-w-[180px] text-center">{weekLabel}</span>
                <Button variant="ghost" size="icon" onClick={() => navigateWeek(1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <Card>
              <CardContent className="pt-6">
                {/* Week day columns */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 mb-4">
                  {selectedWeekDates.map((date, i) => {
                    const daySlots = appliedByDate[date] || [];
                    const dayName = format(parseISO(date), 'EEE');
                    const dayNum = format(parseISO(date), 'd');
                    const isToday = date === format(new Date(), 'yyyy-MM-dd');
                    const isBlocked = blockedDates.some(b => b.specific_date === date);

                    return (
                      <div key={date} className="text-center">
                        <div className={`text-xs font-medium mb-1 ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                          {dayName}
                        </div>
                        <div className={`text-lg font-semibold mb-2 ${isToday ? 'text-primary' : ''}`}>
                          {dayNum}
                        </div>
                        {isBlocked ? (
                          <Badge variant="outline" className="text-destructive border-destructive/30">
                            Blocked
                          </Badge>
                        ) : daySlots.length > 0 ? (
                          <div className="space-y-1">
                            {daySlots.map((slot) => (
                              <div
                                key={slot.id}
                                className="rounded-md bg-primary/10 px-2 py-1 text-[11px] relative group"
                              >
                                <div>{formatTime(slot.start_time)}</div>
                                <div>{formatTime(slot.end_time)}</div>
                                <div className="text-muted-foreground">
                                  {formatCapacity(slot.max_capacity)}
                                </div>
                                <button
                                  onClick={() => deleteSlot(slot.id)}
                                  className="absolute -top-1 -right-1 hidden group-hover:flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
                                >
                                  <Trash2 className="h-2.5 w-2.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-muted-foreground">—</p>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2 pt-4 border-t">
                  <Button onClick={applyTemplateToWeek} disabled={applyingWeek}>
                    {applyingWeek ? (
                      <Spinner size="sm" />
                    ) : appliedSuccess ? (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        Applied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-2" />
                        {weekHasApplied ? 'Re-apply Template' : 'Apply Template'}
                      </>
                    )}
                  </Button>
                  {weekHasApplied && (
                    <Button variant="outline" onClick={clearWeek} className="text-destructive">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Clear Week
                    </Button>
                  )}
                  {weekHasApplied && (
                    <span className="text-xs text-muted-foreground ml-2">
                      Template applied — you can remove individual slots by hovering
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ── Blocked Dates ── */}
          {blockedDates.length > 0 && (
            <section>
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
            </section>
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
  const [slotPreset, setSlotPreset] = useState<SlotPreset>('morning');
  const [customSlots, setCustomSlots] = useState([{ startTime: '08:00', endTime: '10:00' }]);
  const [maxCapacity, setMaxCapacity] = useState(NO_LIMIT);
  const [loading, setLoading] = useState(false);

  const supabase = createClient();

  function getTimesForPreset(preset: SlotPreset) {
    switch (preset) {
      case 'morning': return [{ startTime: '07:00', endTime: '09:00' }];
      case 'evening': return [{ startTime: '18:00', endTime: '20:00' }];
      case 'custom': return customSlots;
    }
  }

  function addCustomSlot() {
    setCustomSlots([...customSlots, { startTime: '08:00', endTime: '10:00' }]);
  }

  function removeCustomSlot(index: number) {
    setCustomSlots(customSlots.filter((_, i) => i !== index));
  }

  function updateCustomSlot(index: number, field: 'startTime' | 'endTime', value: string) {
    const updated = [...customSlots];
    updated[index] = { ...updated[index], [field]: value };
    setCustomSlots(updated);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const slots = getTimesForPreset(slotPreset);
      const inserts = slots.map(slot => ({
        day_of_week: dayOfWeek,
        start_time: slot.startTime + ':00',
        end_time: slot.endTime + ':00',
        is_recurring: true,
        max_capacity: maxCapacity,
      }));

      const { error } = await supabase.from('availability').insert(inserts);

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
    <Modal isOpen={isOpen} onClose={onClose} title="Add to Weekly Template">
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

        <div>
          <label className="block text-sm font-medium mb-1">Time Slot</label>
          <div className="grid grid-cols-3 gap-2">
            {([
              { value: 'morning' as SlotPreset, label: 'Morning', desc: '7 – 9 AM' },
              { value: 'evening' as SlotPreset, label: 'Evening', desc: '6 – 8 PM' },
              { value: 'custom' as SlotPreset, label: 'Custom', desc: 'Set your own' },
            ]).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setSlotPreset(option.value)}
                className={`rounded-lg border-2 p-3 text-center transition-colors ${
                  slotPreset === option.value
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <div className="font-medium text-sm">{option.label}</div>
                <div className="text-xs text-muted-foreground">{option.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {slotPreset === 'custom' && (
          <div className="space-y-3">
            {customSlots.map((slot, index) => (
              <div key={index} className="flex items-end gap-2">
                <div className="flex-1">
                  {index === 0 && (
                    <label className="block text-sm font-medium mb-1">Start</label>
                  )}
                  <Input
                    type="time"
                    value={slot.startTime}
                    onChange={(e) => updateCustomSlot(index, 'startTime', e.target.value)}
                    required
                  />
                </div>
                <div className="flex-1">
                  {index === 0 && (
                    <label className="block text-sm font-medium mb-1">End</label>
                  )}
                  <Input
                    type="time"
                    value={slot.endTime}
                    onChange={(e) => updateCustomSlot(index, 'endTime', e.target.value)}
                    required
                  />
                </div>
                {customSlots.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 text-destructive"
                    onClick={() => removeCustomSlot(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addCustomSlot}>
              <Plus className="h-4 w-4 mr-1" />
              Add another time slot
            </Button>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">Max Capacity per Hour</label>
          <Select
            value={maxCapacity.toString()}
            onChange={(e) => setMaxCapacity(parseInt(e.target.value))}
          >
            {CAPACITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex gap-2 justify-end pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? <Spinner size="sm" /> : 'Add to Template'}
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
