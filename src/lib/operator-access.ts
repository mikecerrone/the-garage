import { cookies } from 'next/headers';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

export const OPERATOR_TRUST_COOKIE = 'garage_operator_trusted_until';
export const OPERATOR_TRUST_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

type OperatorFailureReason =
  | 'auth_error'
  | 'not_operator'
  | 'unauthenticated'
  | 'untrusted_device';

export interface OperatorAccess {
  email: string | null;
  isOperator: boolean;
  reason: OperatorFailureReason | null;
  user: User | null;
}

function splitConfigList(value?: string | null) {
  return (value || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function getOperatorEmails() {
  return splitConfigList(process.env.OPERATOR_EMAILS);
}

export function isOperatorEmail(email?: string | null) {
  if (!email) {
    return false;
  }

  const operatorEmails = getOperatorEmails();
  if (operatorEmails.length === 0) {
    return false;
  }

  return operatorEmails.includes(email.toLowerCase());
}

export function isOperatorBypassEnabled() {
  return (
    process.env.OPERATOR_TEST_BYPASS === 'true' &&
    process.env.NODE_ENV !== 'production'
  );
}

export function isQuickAddEnabled() {
  if (process.env.ENABLE_QUICK_ADD === 'true') {
    return true;
  }

  if (process.env.ENABLE_QUICK_ADD === 'false') {
    return false;
  }

  return process.env.NODE_ENV !== 'production';
}

export function isTrustedOperatorCookie(
  value?: string | null,
  now: Date = new Date()
) {
  if (!value) {
    return false;
  }

  const expiresAt = Date.parse(value);
  return Number.isFinite(expiresAt) && expiresAt > now.getTime();
}

export function getOperatorTrustCookieValue(now: Date = new Date()) {
  return new Date(
    now.getTime() + OPERATOR_TRUST_MAX_AGE_SECONDS * 1000
  ).toISOString();
}

export function getSafeNextPath(next?: string | null, fallback = '/quick-add') {
  if (!next || !next.startsWith('/') || next.startsWith('//')) {
    return fallback;
  }

  return next;
}

export function getOperatorLoginPath(next?: string | null, error?: string) {
  const safeNextPath = getSafeNextPath(next);
  const searchParams = new URLSearchParams();

  if (safeNextPath) {
    searchParams.set('next', safeNextPath);
  }

  if (error) {
    searchParams.set('error', error);
  }

  const query = searchParams.toString();
  return query ? `/operator-login?${query}` : '/operator-login';
}

export async function getOperatorAccess(): Promise<OperatorAccess> {
  if (isOperatorBypassEnabled()) {
    return {
      email: 'operator-bypass@local.test',
      isOperator: true,
      reason: null,
      user: null,
    };
  }

  const cookieStore = await cookies();
  const trustedUntil = cookieStore.get(OPERATOR_TRUST_COOKIE)?.value;

  if (!isTrustedOperatorCookie(trustedUntil)) {
    return {
      email: null,
      isOperator: false,
      reason: 'untrusted_device',
      user: null,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    return {
      email: null,
      isOperator: false,
      reason: 'auth_error',
      user: null,
    };
  }

  if (!user?.email) {
    return {
      email: null,
      isOperator: false,
      reason: 'unauthenticated',
      user: null,
    };
  }

  if (!isOperatorEmail(user.email)) {
    return {
      email: user.email,
      isOperator: false,
      reason: 'not_operator',
      user,
    };
  }

  return {
    email: user.email.toLowerCase(),
    isOperator: true,
    reason: null,
    user,
  };
}
