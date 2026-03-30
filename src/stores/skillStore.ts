import { create } from 'zustand';
import { Skill, SkillCategory } from '../types';

interface SkillStore {
  skills: Record<string, Skill>;
  categories: SkillCategory[];

  createSkill: (skill: Omit<Skill, 'id'>) => Skill;
  updateSkill: (id: string, updates: Partial<Skill>) => void;
  deleteSkill: (id: string) => void;
  getSkillsByCategory: (category: SkillCategory) => Skill[];
}

const generateId = () => crypto.randomUUID();

export const useSkillStore = create<SkillStore>((set, get) => ({
  skills: {},
  categories: ['code_review', 'debugging', 'refactoring', 'testing', 'documentation', 'deployment', 'analysis', 'custom'],

  createSkill: (skillData) => {
    const id = generateId();
    const skill: Skill = { ...skillData, id };
    set((state) => ({
      skills: { ...state.skills, [id]: skill },
    }));
    return skill;
  },

  updateSkill: (id, updates) => {
    set((state) => {
      const skill = state.skills[id];
      if (!skill) return state;
      return {
        skills: { ...state.skills, [id]: { ...skill, ...updates } },
      };
    });
  },

  deleteSkill: (id) => {
    set((state) => {
      const { [id]: _, ...rest } = state.skills;
      return { skills: rest };
    });
  },

  getSkillsByCategory: (category) => {
    const { skills } = get();
    return Object.values(skills).filter((skill) => skill.category === category);
  },
}));
