export type AgentStatus = 'idle' | 'active' | 'success' | 'error' | 'processing';

export interface Agent {
  id: string;
  name: string;
  description: string;
  status: AgentStatus;
  teamId: string | null;
  skills: string[];
  currentTask: string | null;
  trabajoTerminado: boolean;
  createdAt: Date;
}

export interface Team {
  id: string;
  name: string;
  description: string;
  agents: string[];
  topology: 'hierarchical' | 'mesh' | 'star' | 'chain';
  createdAt: Date;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  prompt: string;
}

export type SkillCategory =
  | 'code_review'
  | 'debugging'
  | 'refactoring'
  | 'testing'
  | 'documentation'
  | 'deployment'
  | 'analysis'
  | 'custom';

export interface Task {
  id: string;
  title: string;
  description: string;
  assignedAgentId: string;
  status: TaskStatus;
  priority: 1 | 2 | 3 | 4;
  trabajoTerminado: boolean;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  body: string;
  agentId: string | null;
  taskId: string | null;
  read: boolean;
  createdAt: Date;
}

export interface TerminalSession {
  id: string;
  agentId: string | null;
  pid: number;
  cwd: string;
  isActive: boolean;
}

export interface Message {
  id: string;
  type: 'user' | 'agent' | 'system';
  senderId: string | null;
  content: string;
  timestamp: Date;
}
