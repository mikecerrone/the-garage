'use client';

import { ReactNode, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Calendar,
  Users,
  Clock,
  DollarSign,
  Menu,
  X,
  Home,
  MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
}

const navItems: NavItem[] = [
  { href: '/admin', label: 'Today', icon: <Home className="h-5 w-5" /> },
  { href: '/admin/schedule', label: 'Schedule', icon: <Calendar className="h-5 w-5" /> },
  { href: '/admin/availability', label: 'Availability', icon: <Clock className="h-5 w-5" /> },
  { href: '/admin/members', label: 'Members', icon: <Users className="h-5 w-5" /> },
  { href: '/admin/messages', label: 'Messages', icon: <MessageSquare className="h-5 w-5" /> },
  { href: '/admin/billing', label: 'Cash Tab', icon: <DollarSign className="h-5 w-5" /> },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile header */}
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

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 transform bg-card border-r border-border transition-transform duration-200 ease-in-out lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
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

        {/* Nav */}
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

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-border p-4">
          <p className="text-xs text-muted-foreground">
            Bob&apos;s Garage Gym
          </p>
        </div>
      </aside>

      {/* Main content */}
      <main className="lg:pl-64">
        <div className="min-h-screen p-4 lg:p-6">{children}</div>
      </main>
    </div>
  );
}
