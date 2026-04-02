import { useState } from 'react';
import { Plus, Search, Wrench, Eye, Code, Bug, FileText, Rocket, Brain, Sparkles, Trash2, Edit2 } from 'lucide-react';
import { useSkillStore } from '../../../stores/skillStore';
import { SkillBadge } from '../../Shared/SkillBadge';
import { GlassModal } from '../../Shared/GlassModal';
import { SkillCategory, Skill } from '../../../types';

const categoryIcons: Record<SkillCategory, React.ReactNode> = {
  code_review: <Eye className="w-5 h-5" />,
  debugging: <Bug className="w-5 h-5" />,
  refactoring: <Code className="w-5 h-5" />,
  testing: <Wrench className="w-5 h-5" />,
  documentation: <FileText className="w-5 h-5" />,
  deployment: <Rocket className="w-5 h-5" />,
  analysis: <Brain className="w-5 h-5" />,
  custom: <Sparkles className="w-5 h-5" />,
};

const categoryColors: Record<SkillCategory, string> = {
  code_review: 'border-primary/30',
  debugging: 'border-error/30',
  refactoring: 'border-secondary/30',
  testing: 'border-tertiary/30',
  documentation: 'border-on-surface-variant/30',
  deployment: 'border-primary/30',
  analysis: 'border-secondary/30',
  custom: 'border-on-surface-variant/30',
};

export function SkillsLibrary() {
  const { skills, categories, createSkill, deleteSkill } = useSkillStore();
  const [selectedCategory, setSelectedCategory] = useState<SkillCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewSkillModal, setShowNewSkillModal] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);

  const skillsList = Object.values(skills);

  const filteredSkills = skillsList.filter((skill) => {
    const matchesCategory = selectedCategory === 'all' || skill.category === selectedCategory;
    const matchesSearch = skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      skill.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const getSkillCount = (category: SkillCategory) => {
    return skillsList.filter((s) => s.category === category).length;
  };

  return (
    <div className="h-full flex">
      {/* Categories Sidebar */}
      <div className="w-64 bg-surface-container-low border-r border-outline-variant/15 p-4">
        <h2 className="font-headline font-semibold text-on-surface mb-4">Categorías</h2>
        <div className="space-y-1">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
              selectedCategory === 'all'
                ? 'bg-primary-container/20 text-primary'
                : 'text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            <Wrench className="w-4 h-4" />
            <span className="text-sm">Todas</span>
            <span className="ml-auto text-xs opacity-60">{skillsList.length}</span>
          </button>
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                selectedCategory === category
                  ? 'bg-primary-container/20 text-primary'
                  : 'text-on-surface-variant hover:bg-surface-container'
              }`}
            >
              {categoryIcons[category]}
              <span className="text-sm capitalize">{category.replace('_', ' ')}</span>
              <span className="ml-auto text-xs opacity-60">{getSkillCount(category)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Skills Grid */}
      <div className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-headline font-bold text-on-surface">Biblioteca de Skills</h1>
            <p className="text-on-surface-variant text-sm mt-1">
              {filteredSkills.length} skills disponibles
            </p>
          </div>
          <button
            onClick={() => setShowNewSkillModal(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Nueva Skill
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar skills..."
            className="w-full pl-10 pr-4 py-2 bg-surface-container rounded-md text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        {/* Skills */}
        {filteredSkills.length === 0 ? (
          <div className="agent-card text-center py-12">
            <Wrench className="w-12 h-12 text-on-surface-variant mx-auto mb-4" />
            <p className="text-on-surface-variant">No hay skills creadas</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {filteredSkills.map((skill) => (
              <div
                key={skill.id}
                onClick={() => setSelectedSkill(skill)}
                className={`agent-card cursor-pointer border-l-4 ${categoryColors[skill.category]} hover:bg-surface-container-high transition-colors`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-headline font-semibold text-on-surface">{skill.name}</h3>
                    <p className="text-on-surface-variant text-sm mt-1 line-clamp-2">
                      {skill.description}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <SkillBadge name={skill.category.replace('_', ' ')} category={skill.category} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Skill Detail Modal */}
      {selectedSkill && (
        <GlassModal
          isOpen={!!selectedSkill}
          onClose={() => setSelectedSkill(null)}
          title={selectedSkill.name}
          width="lg"
        >
          <div className="space-y-4">
            <div>
              <label className="text-xs uppercase tracking-wide text-on-surface-variant">Descripción</label>
              <p className="text-on-surface mt-1">{selectedSkill.description}</p>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-on-surface-variant">Categoría</label>
              <div className="mt-1">
                <SkillBadge name={selectedSkill.category.replace('_', ' ')} category={selectedSkill.category} />
              </div>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-on-surface-variant">Prompt</label>
              <pre className="mt-1 p-3 bg-surface-container-lowest rounded text-sm text-on-surface font-mono overflow-auto">
                {selectedSkill.prompt}
              </pre>
            </div>
            {/* Delete / Edit actions */}
            <div className="flex justify-end gap-2 pt-2 border-t border-outline-variant/15">
              <button
                onClick={() => {
                  setShowNewSkillModal(true);
                  setSelectedSkill(null);
                }}
                className="flex items-center gap-2 px-4 py-2 text-sm text-on-surface-variant hover:text-on-surface border border-outline-variant/30 rounded transition-colors"
              >
                <Edit2 className="w-3 h-3" />
                Editar
              </button>
              <button
                onClick={() => {
                  deleteSkill(selectedSkill.id);
                  setSelectedSkill(null);
                }}
                className="flex items-center gap-2 px-4 py-2 text-sm text-on-error bg-error rounded hover:bg-error/90 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                Eliminar
              </button>
            </div>
          </div>
        </GlassModal>
      )}

      {/* New Skill Modal */}
      <NewSkillModal
        isOpen={showNewSkillModal}
        onClose={() => setShowNewSkillModal(false)}
        categories={categories}
        onCreate={createSkill}
      />
    </div>
  );
}

interface NewSkillModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: SkillCategory[];
  onCreate: (skill: Omit<Skill, 'id'>) => void;
}

function NewSkillModal({ isOpen, onClose, categories, onCreate }: NewSkillModalProps) {
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<SkillCategory>('custom');
  const [prompt, setPrompt] = useState('');

  const handleCreate = () => {
    if (!name.trim()) {
      setNameError('El nombre de la skill es requerido');
      return;
    }
    setNameError('');
    onCreate({ name, description, category, prompt });
    setName('');
    setDescription('');
    setCategory('custom');
    setPrompt('');
    onClose();
  };

  return (
    <GlassModal isOpen={isOpen} onClose={onClose} title="Nueva Skill">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-on-surface mb-1">Nombre</label>
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setNameError(''); }}
            className={`w-full px-3 py-2 bg-surface-container-low rounded-md text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 ${nameError ? 'ring-1 ring-error/60 focus:ring-error/60' : 'focus:ring-primary/50'}`}
          />
          {nameError && <p className="text-error text-xs mt-1 font-mono">{nameError}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-on-surface mb-1">Descripción</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 bg-surface-container-low rounded-md text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-on-surface mb-1">Categoría</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as SkillCategory)}
            className="w-full px-3 py-2 bg-surface-container-low rounded-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-on-surface mb-1">Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder="Define el comportamiento de la skill..."
            className="w-full px-3 py-2 bg-surface-container-low rounded-md text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none font-mono text-sm"
          />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
          <button onClick={handleCreate} className="btn-primary">Crear</button>
        </div>
      </div>
    </GlassModal>
  );
}
