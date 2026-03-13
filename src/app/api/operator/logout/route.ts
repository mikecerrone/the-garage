import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import {
  isOperatorBypassEnabled,
  OPERATOR_TRUST_COOKIE,
} from '@/lib/operator-access';

const PLACEHOLDER_URL = 'https://placeholder.supabase.co';
const PLACEHOLDER_KEY = 'placeholder-key';

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ success: true });

  if (!isOperatorBypassEnabled()) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || PLACEHOLDER_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || PLACEHOLDER_KEY,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, options, value }) => {
              response.cookies.set(name, value, options);
            });
          },
        },
      }
    );

    await supabase.auth.signOut();
  }

  response.cookies.delete(OPERATOR_TRUST_COOKIE);
  return response;
}
