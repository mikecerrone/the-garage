'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Calendar,
  Clock,
  DollarSign,
  Home,
  LogOut,
  Menu,
  MessageSquare,
  PlusSquare,
  Users,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface NavItem {
  href: string;
  icon: ReactNode;
  label: string;
}

const baseNavItems: NavItem[] = [
  { href: '/admin', label: 'Today', icon: <Home className="h-5 w-5" /> },
  { href: '/admin/schedule', label: 'Schedule', icon: <Calendar className="h-5 w-5" /> },
  { href: '/admin/availability', label: 'Availability', icon: <Clock className="h-5 w-5" /> },
  { href: '/admin/members', label: 'Members', icon: <Users className="h-5 w-5" /> },
  { href: '/admin/messages', label: 'Messages', icon: <MessageSquare className="h-5 w-5" /> },
  { href: '/admin/billing', label: 'Cash Tab', icon: <DollarSign className="h-5 w-5" /> },
];

interface AdminShellProps {
  children: ReactNode;
  showQuickAdd: boolean;
}

export function AdminShell({ children, showQuickAdd }: AdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navItems = showQuickAdd
    ? [
        { href: '/quick-add', label: 'Quick Add', icon: <PlusSquare className="h-5 w-5" /> },
        ...baseNavItems,
      ]
    : baseNavItems;

  async function handleSignOut() {
    setIsSigningOut(true);

    try {
      await fetch('/api/operator/logout', {
        method: 'POST',
      });
    } finally {
      router.push('/operator-login');
      router.refresh();
      setIsSigningOut(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b border-border bg-card px-4 lg:hidden">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-primary">THE GARAGE</span>
        </div>
      </header>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 transform border-r border-border bg-card transition-transform duration-200 ease-in-out lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <span className="text-xl font-bold text-primary">THE GARAGE</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <nav className="flex flex-col gap-1 p-4">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 space-y-3 border-t border-border p-4">
          <p className="text-xs text-muted-foreground">Bob&apos;s Garage Gym</p>
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={handleSignOut}
            disabled={isSigningOut}
          >
            <LogOut className="mr-2 h-4 w-4" />
            {isSigningOut ? 'Signing out...' : 'Sign out'}
          </Button>
        </div>
      </aside>

      <main className="lg:pl-64">
        <div className="min-h-screen p-4 lg:p-6">{children}</div>
      </main>
    </div>
  );
}
