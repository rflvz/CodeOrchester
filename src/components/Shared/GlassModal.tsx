import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface GlassModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  width?: 'sm' | 'md' | 'lg' | 'xl';
}

export function GlassModal({ isOpen, onClose, title, children, width = 'md' }: GlassModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const widthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        ref={modalRef}
        className={`relative glass-modal rounded-lg p-6 w-full ${widthClasses[width]} shadow-2xl`}
        style={{
          boxShadow: '0 40px 40px rgba(151, 169, 255, 0.06)',
        }}
      >
        {title && (
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-headline font-semibold text-on-surface">{title}</h2>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-surface-container-high transition-colors"
            >
              <X className="w-5 h-5 text-on-surface-variant" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
