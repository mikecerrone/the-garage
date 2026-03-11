import Anthropic from '@anthropic-ai/sdk';
import { format, addDays, parseISO, isValid } from 'date-fns';
import { ParsedIntent, WorkoutType, TimeSlot } from '@/types/database';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface ConversationContext {
  memberName: string;
  memberPhone: string;
  recentMessages: { role: 'user' | 'assistant'; content: string }[];
  availableSlots: TimeSlot[];
  upcomingBookings: { date: string; time: string; workout: string }[];
  currentDate: string;
}

export async function parseBookingIntent(
  message: string,
  context: ConversationContext
): Promise<ParsedIntent> {
  const systemPrompt = buildSystemPrompt(context);

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: systemPrompt,
      messages: [
        ...context.recentMessages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
        { role: 'user', content: message },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    // Parse the JSON response from Claude
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as ParsedIntent;
      return parsed;
    }

    // Fallback if no JSON found
    return {
      action: 'unknown',
      confirmation_message: content.text,
      needs_clarification: true,
    };
  } catch (error) {
    console.error('Error parsing intent with Claude:', error);
    return {
      action: 'unknown',
      confirmation_message:
        "Not sure I caught that — try something like 'Book me for Tuesday at 10am, Push day' or 'What's available this week?'",
      needs_clarification: true,
    };
  }
}

function buildSystemPrompt(context: ConversationContext): string {
  const { memberName, availableSlots, upcomingBookings, currentDate } = context;

  // Format available slots
  const slotsText = availableSlots.length > 0
    ? availableSlots
        .slice(0, 20) // Limit to prevent token overflow
        .map(
          (s) =>
            `${format(parseISO(s.date), 'EEE M/d')} at ${formatTimeShort(s.start_time)} (${s.available_spots} spot${s.available_spots > 1 ? 's' : ''})`
        )
        .join('\n')
    : 'No slots available in the next 7 days';

  // Format upcoming bookings
  const bookingsText = upcomingBookings.length > 0
    ? upcomingBookings
        .map((b) => `${format(parseISO(b.date), 'EEE M/d')} at ${formatTimeShort(b.time)} - ${b.workout}`)
        .join('\n')
    : 'No upcoming bookings';

  return `You are the SMS assistant for "The Garage" — a neighborhood garage gym run by Bob. You help neighbors book, check, and manage their workout sessions via text message.

CURRENT DATE: ${format(parseISO(currentDate), 'EEEE, MMMM d, yyyy')}
MEMBER: ${memberName || 'Unknown neighbor'}

AVAILABLE SLOTS THIS WEEK:
${slotsText}

${memberName ? `${memberName.split(' ')[0].toUpperCase()}'S UPCOMING BOOKINGS:\n${bookingsText}` : ''}

WORKOUT TYPES:
- Pull (Arms/Back)
- Push (Chest/Shoulders)
- Legs
- Other

YOUR TASK:
Parse the user's message and respond with a JSON object containing:
- action: "book" | "cancel" | "check" | "reschedule" | "unknown"
- date: ISO date string (YYYY-MM-DD) if applicable
- time: time string (HH:MM) if applicable
- workout_type: "pull" | "push" | "legs" | "other" if applicable
- confirmation_message: A friendly, conversational response (1-3 sentences max)
- needs_clarification: boolean if you need more info

CONVERSATION STYLE:
- Be warm and friendly, like texting with a neighbor
- Keep responses SHORT — this is SMS, not email
- Use casual language but be clear about bookings
- Reference "The Garage" naturally
- If they mention "tomorrow", "next Tuesday", etc., convert to actual dates
- When listing available times, be concise

EXAMPLES:

User: "Hey can I come tomorrow at 9am for legs?"
Response: {"action": "book", "date": "2024-03-12", "time": "09:00", "workout_type": "legs", "confirmation_message": "You're booked! Tomorrow (Tue 3/12) at 9:00 AM — Legs day. See you at The Garage!", "needs_clarification": false}

User: "What's open Thursday?"
Response: {"action": "check", "date": "2024-03-14", "confirmation_message": "Thursday looks good! I have 6 AM, 7 AM, 9 AM, and 4 PM available. What time works and what workout — Push, Pull, Legs, or Other?", "needs_clarification": true, "clarification_question": "time and workout type"}

User: "Cancel my Friday session"
Response: {"action": "cancel", "date": "2024-03-15", "confirmation_message": "Done — your Friday 10:00 AM session is cancelled. Want to rebook for another time?", "needs_clarification": false}

User: "asdfasdf"
Response: {"action": "unknown", "confirmation_message": "Not sure I caught that — try something like 'Book me for Tuesday at 10am, Push day' or 'What's open this week?'", "needs_clarification": true}

Now parse this message and respond with ONLY a JSON object:`;
}

function formatTimeShort(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return minutes === 0 ? `${hour12} ${ampm}` : `${hour12}:${minutes.toString().padStart(2, '0')} ${ampm}`;
}
