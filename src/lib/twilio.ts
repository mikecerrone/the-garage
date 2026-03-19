import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE_NUMBER;
const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

let client: twilio.Twilio | null = null;

export function getTwilioClient() {
  if (!client && accountSid && authToken) {
    client = twilio(accountSid, authToken);
  }
  return client;
}

export async function sendSMS(to: string, body: string): Promise<boolean> {
  const twilioClient = getTwilioClient();

  if (!twilioClient || !twilioPhone) {
    console.error('Twilio not configured');
    return false;
  }

  try {
    await twilioClient.messages.create({
      body,
      ...(messagingServiceSid ? { messagingServiceSid } : { from: twilioPhone }),
      to,
    });
    return true;
  } catch (error) {
    console.error('Error sending SMS:', error);
    return false;
  }
}

// Verify Twilio webhook signature
export function verifyTwilioSignature(
  signature: string,
  url: string,
  params: Record<string, string>
): boolean {
  if (!authToken) return false;

  const twilioSignature = twilio.validateRequest(
    authToken,
    signature,
    url,
    params
  );

  return twilioSignature;
}
