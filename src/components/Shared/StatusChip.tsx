import { AgentStatus } from '../../types';

interface StatusChipProps {
  status: AgentStatus;
  trabajoTerminado?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

const statusLabels: Record<AgentStatus, string> = {
  idle: 'Idle',
  active: 'Active',
  success: 'Completed',
  error: 'Error',
  processing: 'Processing',
};

export function StatusChip({
  status,
  trabajoTerminado,
  size = 'md',
  showLabel = true,
}: StatusChipProps) {
  const getStatusColor = () => {
    switch (status) {
      case 'idle':
        return 'bg-surface-container-low text-on-surface-variant';
      case 'active':
        return 'bg-primary-container/20 text-primary';
      case 'success':
        return trabajoTerminado === false
          ? 'bg-error/20 text-error animate-pulse'
          : 'text-secondary';
      case 'error':
        return 'bg-error/20 text-error animate-pulse';
      case 'processing':
        return 'bg-tertiary-container/20 text-tertiary animate-pulse';
      default:
        return 'bg-surface-container-low text-on-surface-variant';
    }
  };

  const getDotColor = () => {
    switch (status) {
      case 'idle':
        return 'bg-on-surface-variant';
      case 'active':
        return 'bg-primary';
      case 'success':
        return trabajoTerminado === false ? 'bg-error' : 'bg-secondary';
      case 'error':
        return 'bg-error';
      case 'processing':
        return 'bg-tertiary';
      default:
        return 'bg-on-surface-variant';
    }
  };

  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-xs',
    md: 'px-2 py-1 text-sm',
    lg: 'px-3 py-1.5 text-base',
  };

  const dotSizeClasses = {
    sm: 'w-1.5 h-1.5',
    md: 'w-2 h-2',
    lg: 'w-2.5 h-2.5',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded font-medium ${sizeClasses[size]} ${getStatusColor()}`}
    >
      <span className={`rounded-full ${dotSizeClasses[size]} ${getDotColor()}`} />
      {showLabel && (
        <span>
          {trabajoTerminado === false && status === 'success' ? 'Failed' : statusLabels[status]}
        </span>
      )}
    </span>
  );
}
