'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import {
  Users,
  Plus,
  Search,
  Phone,
  Calendar,
  MoreVertical,
  Edit,
  Trash2,
  MessageSquare,
  History,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Member, Session } from '@/types/database';
import { formatPhone, formatDate, workoutTypeConfig } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Modal } from '@/components/ui/modal';

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [editingMember, setEditingMember] = useState<Member | null>(null);

  const supabase = createClient();

  useEffect(() => {
    fetchMembers();
  }, []);

  async function fetchMembers() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('members')
        .select('*')
        .order('name');

      if (error) throw error;
      setMembers(data || []);
    } catch (error) {
      console.error('Error fetching members:', error);
    } finally {
      setLoading(false);
    }
  }

  async function toggleMemberStatus(member: Member) {
    try {
      const { error } = await supabase
        .from('members')
        .update({ is_active: !member.is_active })
        .eq('id', member.id);

      if (error) throw error;
      fetchMembers();
    } catch (error) {
      console.error('Error updating member:', error);
    }
  }

  async function deleteMember(id: string) {
    if (!confirm('Are you sure you want to delete this member? This will also delete all their sessions.')) {
      return;
    }

    try {
      const { error } = await supabase.from('members').delete().eq('id', id);
      if (error) throw error;
      fetchMembers();
    } catch (error) {
      console.error('Error deleting member:', error);
    }
  }

  const filteredMembers = members.filter(
    (m) =>
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.phone.includes(searchQuery)
  );

  const activeCount = members.filter((m) => m.is_active).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Members</h1>
          <p className="text-muted-foreground">
            {activeCount} active members
          </p>
        </div>
        <Button onClick={() => setShowAddModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Member
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name or phone..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Members List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : filteredMembers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">
              {searchQuery ? 'No members found' : 'No members yet'}
            </p>
            {!searchQuery && (
              <Button className="mt-4" onClick={() => setShowAddModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add your first member
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filteredMembers.map((member) => (
            <Card
              key={member.id}
              className={`cursor-pointer transition-colors hover:bg-accent/30 ${
                !member.is_active ? 'opacity-60' : ''
              }`}
              onClick={() => setSelectedMember(member)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-primary font-semibold">
                        {member.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        {member.name}
                        {!member.is_active && (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {formatPhone(member.phone)}
                      </div>
                    </div>
                  </div>
                  <div
                    className="flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditingMember(member)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      onClick={() => deleteMember(member.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Member Modal */}
      <AddMemberModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={fetchMembers}
      />

      {/* Edit Member Modal */}
      {editingMember && (
        <EditMemberModal
          member={editingMember}
          onClose={() => setEditingMember(null)}
          onSuccess={fetchMembers}
        />
      )}

      {/* Member Detail Modal */}
      {selectedMember && (
        <MemberDetailModal
          member={selectedMember}
          onClose={() => setSelectedMember(null)}
          onToggleStatus={toggleMemberStatus}
        />
      )}
    </div>
  );
}

// Add Member Modal
interface AddMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function AddMemberModal({ isOpen, onClose, onSuccess }: AddMemberModalProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Normalize phone number
      const normalizedPhone = phone.replace(/\D/g, '');
      const formattedPhone = normalizedPhone.length === 10
        ? `+1${normalizedPhone}`
        : normalizedPhone.length === 11 && normalizedPhone.startsWith('1')
        ? `+${normalizedPhone}`
        : phone;

      const { error: insertError } = await supabase.from('members').insert({
        name: name.trim(),
        phone: formattedPhone,
        notes: notes.trim() || null,
      });

      if (insertError) {
        if (insertError.code === '23505') {
          setError('A member with this phone number already exists');
          return;
        }
        throw insertError;
      }

      onSuccess();
      onClose();
      setName('');
      setPhone('');
      setNotes('');
    } catch (err) {
      console.error('Error adding member:', err);
      setError('Failed to add member');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add New Member">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">Name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="John Smith"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Phone Number</label>
          <Input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(555) 123-4567"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Notes (optional)</label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any notes about this member..."
          />
        </div>

        <div className="flex gap-2 justify-end pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading || !name || !phone}>
            {loading ? <Spinner size="sm" /> : 'Add Member'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// Edit Member Modal
interface EditMemberModalProps {
  member: Member;
  onClose: () => void;
  onSuccess: () => void;
}

function EditMemberModal({ member, onClose, onSuccess }: EditMemberModalProps) {
  const [name, setName] = useState(member.name);
  const [phone, setPhone] = useState(member.phone);
  const [notes, setNotes] = useState(member.notes || '');
  const [loading, setLoading] = useState(false);

  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase
        .from('members')
        .update({
          name: name.trim(),
          phone: phone.trim(),
          notes: notes.trim() || null,
        })
        .eq('id', member.id);

      if (error) throw error;
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error updating member:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal isOpen={true} onClose={onClose} title="Edit Member">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Phone Number</label>
          <Input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Notes</label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any notes..."
          />
        </div>

        <div className="flex gap-2 justify-end pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? <Spinner size="sm" /> : 'Save Changes'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// Member Detail Modal
interface MemberDetailModalProps {
  member: Member;
  onClose: () => void;
  onToggleStatus: (member: Member) => void;
}

function MemberDetailModal({
  member,
  onClose,
  onToggleStatus,
}: MemberDetailModalProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, thisMonth: 0 });

  const supabase = createClient();

  useEffect(() => {
    fetchMemberSessions();
  }, [member.id]);

  async function fetchMemberSessions() {
    try {
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('member_id', member.id)
        .order('date', { ascending: false })
        .limit(10);

      if (error) throw error;
      setSessions(data || []);

      // Get stats
      const { count: total } = await supabase
        .from('sessions')
        .select('*', { count: 'exact', head: true })
        .eq('member_id', member.id)
        .eq('attended', true);

      const startOfMonth = format(new Date(), 'yyyy-MM-01');
      const { count: thisMonth } = await supabase
        .from('sessions')
        .select('*', { count: 'exact', head: true })
        .eq('member_id', member.id)
        .eq('attended', true)
        .gte('date', startOfMonth);

      setStats({ total: total || 0, thisMonth: thisMonth || 0 });
    } catch (error) {
      console.error('Error fetching sessions:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal isOpen={true} onClose={onClose} title="Member Details">
      <div className="space-y-4">
        {/* Member Info */}
        <div className="flex items-center gap-3">
          <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-primary font-bold text-xl">
              {member.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <div className="font-semibold text-lg">{member.name}</div>
            <div className="text-sm text-muted-foreground">
              {formatPhone(member.phone)}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 py-4 border-y border-border">
          <div className="text-center">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-sm text-muted-foreground">Total Sessions</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">{stats.thisMonth}</div>
            <div className="text-sm text-muted-foreground">This Month</div>
          </div>
        </div>

        {/* Notes */}
        {member.notes && (
          <div>
            <div className="text-sm text-muted-foreground mb-1">Notes</div>
            <p className="text-sm">{member.notes}</p>
          </div>
        )}

        {/* Recent Sessions */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <History className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Recent Sessions</span>
          </div>
          {loading ? (
            <div className="py-4 text-center">
              <Spinner size="sm" />
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No sessions yet
            </p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between text-sm py-1"
                >
                  <span>{formatDate(session.date)}</span>
                  <Badge variant="workout" workoutType={session.workout_type}>
                    {workoutTypeConfig[session.workout_type].label}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end pt-4">
          <Button
            variant="outline"
            onClick={() => {
              onToggleStatus(member);
              onClose();
            }}
          >
            {member.is_active ? 'Deactivate' : 'Activate'}
          </Button>
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  );
}
