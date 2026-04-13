import { z } from 'zod';

export const AppSettingsSchema = z.object({
  minimaxApiKey: z.string().optional(),
  minimaxAppId: z.string().optional(),
  claudeCliPath: z.string().optional(),
  claudeWorkDir: z.string().optional(),
  darkMode: z.boolean().optional(),
  desktopNotifications: z.boolean().optional(),
  notificationSound: z.boolean().optional(),
  fontSize: z.enum(['sm', 'md', 'lg']).optional(),
  accentColor: z.enum(['indigo', 'violet', 'cyan', 'emerald']).optional(),
  density: z.enum(['compact', 'normal', 'relaxed']).optional(),
  animationsEnabled: z.boolean().optional(),
});

export const AgentStateSchema = z.record(z.string(), z.unknown());
