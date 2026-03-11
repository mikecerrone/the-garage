'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { MessageSquare, Phone, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { SmsConversation, Member } from '@/types/database';
import { formatPhone } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';

interface ConversationThread {
  phone: string;
  member: Member | null;
  messages: SmsConversation[];
  lastMessage: SmsConversation;
}

export default function MessagesPage() {
  const [threads, setThreads] = useState<ConversationThread[]>([]);
  const [selectedThread, setSelectedThread] = useState<ConversationThread | null>(null);
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  useEffect(() => {
    fetchConversations();
  }, []);

  async function fetchConversations() {
    setLoading(true);
    try {
      // Get all messages with member info
      const { data: messages, error } = await supabase
        .from('sms_conversations')
        .select(`
          *,
          member:members(*)
        `)
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;

      // Group by phone number
      const threadMap: Record<string, ConversationThread> = {};

      (messages || []).forEach((msg: SmsConversation & { member?: Member }) => {
        if (!threadMap[msg.phone]) {
          threadMap[msg.phone] = {
            phone: msg.phone,
            member: msg.member || null,
            messages: [],
            lastMessage: msg,
          };
        }
        threadMap[msg.phone].messages.push(msg);
      });

      // Sort messages within each thread by date ascending
      Object.values(threadMap).forEach((thread) => {
        thread.messages.sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      });

      // Sort threads by last message date
      const sortedThreads = Object.values(threadMap).sort(
        (a, b) =>
          new Date(b.lastMessage.created_at).getTime() -
          new Date(a.lastMessage.created_at).getTime()
      );

      setThreads(sortedThreads);
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Messages</h1>
        <p className="text-muted-foreground">SMS conversation history</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : threads.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">No messages yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Messages will appear here when neighbors text to book
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Thread List */}
          <div className="lg:col-span-1 space-y-2">
            {threads.map((thread) => (
              <Card
                key={thread.phone}
                className={`cursor-pointer transition-colors hover:bg-accent/50 ${
                  selectedThread?.phone === thread.phone
                    ? 'ring-2 ring-primary'
                    : ''
                }`}
                onClick={() => setSelectedThread(thread)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      {thread.member ? (
                        <span className="text-primary font-semibold">
                          {thread.member.name.charAt(0).toUpperCase()}
                        </span>
                      ) : (
                        <Phone className="h-4 w-4 text-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">
                        {thread.member?.name || 'Unknown'}
                      </div>
                      <div className="text-sm text-muted-foreground truncate">
                        {thread.lastMessage.message.slice(0, 40)}...
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {format(parseISO(thread.lastMessage.created_at), 'MMM d')}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Message Thread */}
          <div className="lg:col-span-2">
            {selectedThread ? (
              <Card className="h-[600px] flex flex-col">
                <CardHeader className="border-b border-border">
                  <CardTitle className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      {selectedThread.member ? (
                        <span className="text-primary font-semibold text-sm">
                          {selectedThread.member.name.charAt(0).toUpperCase()}
                        </span>
                      ) : (
                        <Phone className="h-4 w-4 text-primary" />
                      )}
                    </div>
                    <div>
                      <div>{selectedThread.member?.name || 'Unknown'}</div>
                      <div className="text-sm font-normal text-muted-foreground">
                        {formatPhone(selectedThread.phone)}
                      </div>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto p-4">
                  <div className="space-y-4">
                    {selectedThread.messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${
                          msg.direction === 'inbound'
                            ? 'justify-start'
                            : 'justify-end'
                        }`}
                      >
                        <div
                          className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                            msg.direction === 'inbound'
                              ? 'bg-accent text-accent-foreground rounded-bl-none'
                              : 'bg-primary text-primary-foreground rounded-br-none'
                          }`}
                        >
                          <p className="text-sm">{msg.message}</p>
                          <div
                            className={`flex items-center gap-1 mt-1 text-xs ${
                              msg.direction === 'inbound'
                                ? 'text-muted-foreground'
                                : 'text-primary-foreground/70'
                            }`}
                          >
                            {msg.direction === 'inbound' ? (
                              <ArrowDownLeft className="h-3 w-3" />
                            ) : (
                              <ArrowUpRight className="h-3 w-3" />
                            )}
                            {format(parseISO(msg.created_at), 'h:mm a')}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="h-[600px] flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Select a conversation to view</p>
                </div>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
