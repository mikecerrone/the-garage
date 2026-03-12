import { createServerClient } from '@supabase/ssr';
import type { EmailOtpType } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import {
  getOperatorLoginPath,
  getOperatorTrustCookieValue,
  getSafeNextPath,
  isOperatorEmail,
  OPERATOR_TRUST_COOKIE,
  OPERATOR_TRUST_MAX_AGE_SECONDS,
} from '@/lib/operator-access';

const PLACEHOLDER_URL = 'https://placeholder.supabase.co';
const PLACEHOLDER_KEY = 'placeholder-key';

export async function GET(request: NextRequest) {
  const nextPath = getSafeNextPath(request.nextUrl.searchParams.get('next'));
  const code = request.nextUrl.searchParams.get('code');
  const tokenHash = request.nextUrl.searchParams.get('token_hash');
  const type = request.nextUrl.searchParams.get('type');
  const response = NextResponse.redirect(new URL(nextPath, request.url));

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

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        new URL(getOperatorLoginPath(nextPath, 'login_failed'), request.url)
      );
    }
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    });

    if (error) {
      return NextResponse.redirect(
        new URL(getOperatorLoginPath(nextPath, 'login_failed'), request.url)
      );
    }
  } else {
    return NextResponse.redirect(
      new URL(getOperatorLoginPath(nextPath, 'missing_token'), request.url)
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email || !isOperatorEmail(user.email)) {
    await supabase.auth.signOut();
    const unauthorizedResponse = NextResponse.redirect(
      new URL(getOperatorLoginPath(nextPath, 'not_allowed'), request.url)
    );
    unauthorizedResponse.cookies.delete(OPERATOR_TRUST_COOKIE);
    return unauthorizedResponse;
  }

  response.cookies.set(OPERATOR_TRUST_COOKIE, getOperatorTrustCookieValue(), {
    httpOnly: true,
    maxAge: OPERATOR_TRUST_MAX_AGE_SECONDS,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });

  return response;
}
