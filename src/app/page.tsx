import Link from 'next/link';
import { Dumbbell, Calendar, MessageSquare, ArrowRight } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="max-w-md w-full text-center space-y-8">
          {/* Logo */}
          <div className="space-y-2">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-primary/10 mb-4">
              <Dumbbell className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-primary">
              THE GARAGE
            </h1>
            <p className="text-lg text-muted-foreground">
              Bob&apos;s Neighborhood Gym
            </p>
          </div>

          {/* Main Actions */}
          <div className="space-y-4">
            <Link
              href="/book"
              className="flex items-center justify-between w-full p-4 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5" />
                <span className="font-medium">Book a Session</span>
              </div>
              <ArrowRight className="h-5 w-5" />
            </Link>

            <Link
              href="/admin"
              className="flex items-center justify-between w-full p-4 rounded-xl border border-border hover:bg-accent transition-colors"
            >
              <div className="flex items-center gap-3">
                <Dumbbell className="h-5 w-5" />
                <span className="font-medium">Admin Dashboard</span>
              </div>
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>

          {/* Text to Train */}
          <div className="pt-8 border-t border-border">
            <div className="flex items-center justify-center gap-2 text-muted-foreground mb-2">
              <MessageSquare className="h-4 w-4" />
              <span className="text-sm">Prefer to text?</span>
            </div>
            <p className="text-sm">
              Text{' '}
              <a href="sms:+18084272439" className="font-mono font-medium text-primary hover:underline">
                (808) 427-2439
              </a>
              {' '}to book
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              &quot;Hey, can I come tomorrow at 9am for legs?&quot;
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-6">
        <div className="text-center text-sm text-muted-foreground">
          <p>The Garage - Neighborhood fitness, one session at a time</p>
        </div>
      </footer>
    </div>
  );
}
