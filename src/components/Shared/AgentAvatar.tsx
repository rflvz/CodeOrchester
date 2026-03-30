import { Bot, User } from 'lucide-react';

interface AgentAvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  isAgent?: boolean;
}

export function AgentAvatar({ name, size = 'md', isAgent = true }: AgentAvatarProps) {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
  };

  const iconSizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-7 h-7',
  };

  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      className={`${sizeClasses[size]} rounded-md bg-surface-container-highest flex items-center justify-center`}
    >
      {isAgent ? (
        <Bot className={`${iconSizeClasses[size]} text-primary`} />
      ) : (
        <User className={`${iconSizeClasses[size]} text-on-surface-variant`} />
      )}
    </div>
  );
}
