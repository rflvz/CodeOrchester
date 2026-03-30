import { Wrench, Eye, Code, Bug, FileText, Rocket, Brain, Sparkles } from 'lucide-react';
import { SkillCategory } from '../../types';

interface SkillBadgeProps {
  name: string;
  category: SkillCategory;
  size?: 'sm' | 'md';
}

const categoryIcons: Record<SkillCategory, React.ReactNode> = {
  code_review: <Eye className="w-3 h-3" />,
  debugging: <Bug className="w-3 h-3" />,
  refactoring: <Code className="w-3 h-3" />,
  testing: <Wrench className="w-3 h-3" />,
  documentation: <FileText className="w-3 h-3" />,
  deployment: <Rocket className="w-3 h-3" />,
  analysis: <Brain className="w-3 h-3" />,
  custom: <Sparkles className="w-3 h-3" />,
};

const categoryColors: Record<SkillCategory, string> = {
  code_review: 'bg-primary-container/20 text-primary',
  debugging: 'bg-error/20 text-error',
  refactoring: 'bg-secondary-container/20 text-secondary',
  testing: 'bg-tertiary-container/20 text-tertiary',
  documentation: 'bg-surface-container-high text-on-surface-variant',
  deployment: 'bg-primary/20 text-primary',
  analysis: 'bg-secondary/20 text-secondary',
  custom: 'bg-surface-container text-on-surface-variant',
};

export function SkillBadge({ name, category, size = 'sm' }: SkillBadgeProps) {
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs gap-1',
    md: 'px-3 py-1 text-sm gap-1.5',
  };

  return (
    <span
      className={`inline-flex items-center rounded font-medium ${sizeClasses[size]} ${categoryColors[category]}`}
    >
      {categoryIcons[category]}
      <span>{name}</span>
    </span>
  );
}
