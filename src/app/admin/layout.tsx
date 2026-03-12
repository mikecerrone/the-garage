import type { ReactNode } from 'react';
import { isQuickAddEnabled } from '@/lib/operator-access';
import { AdminShell } from '@/components/admin/admin-shell';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell showQuickAdd={isQuickAddEnabled()}>{children}</AdminShell>;
}
