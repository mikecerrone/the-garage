import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import {
  getOperatorLoginPath,
  isOperatorBypassEnabled,
  isOperatorEmail,
  isQuickAddEnabled,
  isTrustedOperatorCookie,
  OPERATOR_TRUST_COOKIE,
} from '@/lib/operator-access';

const PLACEHOLDER_URL = 'https://placeholder.supabase.co';
const PLACEHOLDER_KEY = 'placeholder-key';

function buildUnauthorizedResponse(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/operator/')) {
    return NextResponse.json(
      { error: 'Please sign in again.' },
      { status: 401 }
    );
  }

  const nextPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  return NextResponse.redirect(
    new URL(getOperatorLoginPath(nextPath), request.url)
  );
}

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/quick-add') && !isQuickAddEnabled()) {
    return NextResponse.redirect(new URL('/admin', request.url));
  }

  if (isOperatorBypassEnabled()) {
    return NextResponse.next();
  }

  const trustedUntil = request.cookies.get(OPERATOR_TRUST_COOKIE)?.value;
  if (!isTrustedOperatorCookie(trustedUntil)) {
    return buildUnauthorizedResponse(request);
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || PLACEHOLDER_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || PLACEHOLDER_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });

          cookiesToSet.forEach(({ name, options, value }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.email || !isOperatorEmail(user.email)) {
    const unauthorizedResponse = buildUnauthorizedResponse(request);
    unauthorizedResponse.cookies.delete(OPERATOR_TRUST_COOKIE);
    return unauthorizedResponse;
  }

  return response;
}

export const config = {
  matcher: ['/admin/:path*', '/api/operator/:path*', '/quick-add/:path*'],
};
