import { AgentStatus } from '../../types';

interface StatusChipProps {
  status: AgentStatus;
  trabajoTerminado?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

const statusLabels: Record<AgentStatus, string> = {
  idle: 'IDLE',
  active: 'ACTIVE',
  success: 'COMPLETED',
  error: 'ERROR',
  processing: 'PROCESSING',
};

export function StatusChip({
  status,
  trabajoTerminado,
  size = 'md',
  showLabel = true,
}: StatusChipProps) {
  // Kinetic Terminal: Heat colors - INTENSE red-orange for action
  const getStatusColor = () => {
    switch (status) {
      case 'idle':
        return 'bg-surface-container-low text-on-surface-variant';
      case 'active':
        return 'bg-primary/20 text-primary font-bold';  // INTENSE orange-red
      case 'success':
        return trabajoTerminado === false
          ? 'bg-secondary/20 text-secondary animate-pulse font-bold'  // Deep red for failures
          : 'bg-tertiary-container/20 text-tertiary';
      case 'error':
        return 'bg-secondary/20 text-secondary animate-pulse font-bold';  // Deep red
      case 'processing':
        return 'bg-primary/20 text-primary animate-pulse font-bold';  // INTENSE orange-red
      default:
        return 'bg-surface-container-low text-on-surface-variant';
    }
  };

  const getDotColor = () => {
    switch (status) {
      case 'idle':
        return 'bg-on-surface-variant';
      case 'active':
        return 'bg-primary animate-pulse';  // INTENSE orange-red
      case 'success':
        return trabajoTerminado === false ? 'bg-secondary' : 'bg-tertiary';
      case 'error':
        return 'bg-secondary';  // Deep red
      case 'processing':
        return 'bg-primary';  // INTENSE orange-red
      default:
        return 'bg-on-surface-variant';
    }
  };

  // Kinetic Terminal: Sharp corners for technical feel
  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-xs rounded-sm',
    md: 'px-2 py-1 text-sm rounded-sm',
    lg: 'px-3 py-1.5 text-base rounded-sm',
  };

  const dotSizeClasses = {
    sm: 'w-1.5 h-1.5',
    md: 'w-2 h-2',
    lg: 'w-2.5 h-2.5',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium uppercase tracking-wider ${sizeClasses[size]} ${getStatusColor()}`}
    >
      <span className={`rounded-full ${dotSizeClasses[size]} ${getDotColor()}`} />
      {showLabel && (
        <span>
          {trabajoTerminado === false && status === 'success' ? 'FAILED' : statusLabels[status]}
        </span>
      )}
    </span>
  );
}
