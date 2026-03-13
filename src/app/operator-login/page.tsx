'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Mail, Shield } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { getPublicAppUrl } from '@/lib/public-url';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';

const errorCopy: Record<string, string> = {
  login_failed: 'The sign-in link expired or failed. Try again.',
  missing_token: 'That sign-in link is incomplete. Request a fresh one.',
  not_allowed: 'That email is not approved for the operator tools.',
};

export default function OperatorLoginPage() {
  const [nextPath, setNextPath] = useState('/quick-add');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [linkSent, setLinkSent] = useState(false);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    setNextPath(searchParams.get('next') || '/quick-add');
    setError(errorCopy[searchParams.get('error') || ''] || '');
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const supabase = createClient();
      const publicAppUrl = getPublicAppUrl();
      if (!publicAppUrl) {
        throw new Error('The app URL is not configured. Try again in a moment.');
      }

      const redirectUrl = new URL('/auth/callback', `${publicAppUrl}/`);
      redirectUrl.searchParams.set('next', nextPath);

      const { error: signInError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: redirectUrl.toString(),
        },
      });

      if (signInError) {
        throw signInError;
      }

      setLinkSent(true);
    } catch (signInError) {
      setError(
        signInError instanceof Error
          ? signInError.message
          : 'We could not send the sign-in link. Try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Shield className="h-6 w-6" />
          </div>
          <div>
            <CardTitle className="text-2xl">Operator sign in</CardTitle>
            <CardDescription className="mt-1">
              Send a magic link to the email Bob uses for the gym tools.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {linkSent ? (
            <div className="rounded-xl border border-border bg-accent/30 p-4">
              <p className="font-medium">Check your inbox</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Open the link on this iPhone to unlock Quick Add and the dashboard.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Email</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="bob@thegarage.com"
                  autoComplete="email"
                  required
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button type="submit" className="w-full" disabled={isSubmitting || !email.trim()}>
                {isSubmitting ? (
                  <Spinner size="sm" />
                ) : (
                  <>
                    <Mail className="mr-2 h-4 w-4" />
                    Send magic link
                  </>
                )}
              </Button>
            </form>
          )}

          {process.env.NEXT_PUBLIC_OPERATOR_TEST_BYPASS === 'true' && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => window.location.assign(nextPath)}
            >
              Continue with test access
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}

          <p className="text-center text-sm text-muted-foreground">
            <Link href="/" className="text-primary hover:underline">
              Back to the site
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
