'use client';

import { Fragment, ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Modal({ isOpen, onClose, title, children, className }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal content */}
      <div
        className={cn(
          'relative z-50 w-full max-w-lg mx-4 bg-card rounded-xl shadow-lg',
          'animate-in fade-in-0 zoom-in-95 duration-200',
          className
        )}
      >
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between border-b border-border p-4">
            <h2 className="text-lg font-semibold">{title}</h2>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Body */}
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
