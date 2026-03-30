import { useState } from 'react';
import { Settings, Plus, Trash2, Save, Wrench, Zap, Code, ArrowLeft } from 'lucide-react';
import { useSkillStore } from '../../../stores/skillStore';
import { SkillParameter } from '../../../types';

interface SkillConfigProps {
  skillId?: string;
  onBack?: () => void;
}

export function SkillConfig({ skillId, onBack }: SkillConfigProps) {
  const { skills, updateSkill } = useSkillStore();
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(skillId || null);
  const [parameters, setParameters] = useState<SkillParameter[]>([]);
  const [newParamName, setNewParamName] = useState('');
  const [newParamType, setNewParamType] = useState<'string' | 'number' | 'boolean' | 'array'>('string');
  const [newParamRequired, setNewParamRequired] = useState(false);

  const skillsList = Object.values(skills);
  const selectedSkill = selectedSkillId ? skills[selectedSkillId] : null;

  const handleSelectSkill = (id: string) => {
    const skill = skills[id];
    setSelectedSkillId(id);
    setParameters(skill?.parameters || []);
  };

  const handleAddParameter = () => {
    if (!newParamName.trim()) return;

    const newParam: SkillParameter = {
      name: newParamName.trim(),
      type: newParamType,
      required: newParamRequired,
      defaultValue: newParamType === 'boolean' ? false : newParamType === 'number' ? 0 : '',
    };

    setParameters([...parameters, newParam]);
    setNewParamName('');
    setNewParamType('string');
    setNewParamRequired(false);
  };

  const handleRemoveParameter = (index: number) => {
    setParameters(parameters.filter((_, i) => i !== index));
  };

  const handleUpdateParameter = (index: number, field: keyof SkillParameter, value: any) => {
    setParameters(parameters.map((param, i) => {
      if (i !== index) return param;
      return { ...param, [field]: value };
    }));
  };

  const handleSave = () => {
    if (!selectedSkillId) return;
    updateSkill(selectedSkillId, { parameters });
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'string':
        return <Code className="w-4 h-4" />;
      case 'number':
        return <span className="text-xs font-mono">#</span>;
      case 'boolean':
        return <span className="text-xs font-mono">?</span>;
      case 'array':
        return <span className="text-xs font-mono">[ ]</span>;
      default:
        return <Wrench className="w-4 h-4" />;
    }
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header - Kinetic Terminal style */}
      <div className="p-4 border-b border-outline-variant/15 bg-surface-container-low">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-container/20 rounded">
              <Settings className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-headline font-bold text-on-surface tracking-tight">
                SKILL_PARAMETERS
              </h1>
              <p className="text-on-surface-variant text-xs uppercase tracking-wider font-mono">
                Configure skill execution parameters
              </p>
            </div>
          </div>
          <button
            onClick={onBack}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            VOLVER
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto">
          {/* Skill Selector */}
          <div className="bg-surface-container rounded-lg p-6 border border-outline-variant/15 mb-6">
            <h2 className="font-headline font-semibold text-on-surface text-sm uppercase tracking-wider mb-4">
              Seleccionar Skill
            </h2>
            {skillsList.length === 0 ? (
              <p className="text-on-surface-variant text-sm">
                No hay skills disponibles. Crea una skill primero.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {skillsList.map((skill) => (
                  <button
                    key={skill.id}
                    onClick={() => handleSelectSkill(skill.id)}
                    className={`p-3 rounded text-left transition-colors ${
                      selectedSkillId === skill.id
                        ? 'bg-primary-container/20 border border-primary'
                        : 'bg-surface-container-low hover:bg-surface-container-high border border-transparent'
                    }`}
                  >
                    <span className="text-sm font-mono text-on-surface block truncate">
                      {skill.name}
                    </span>
                    <span className="text-xs text-on-surface-variant capitalize">
                      {skill.category.replace('_', ' ')}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Parameters Configuration */}
          {selectedSkill && (
            <>
              <div className="bg-surface-container rounded-lg p-6 border border-outline-variant/15 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-headline font-semibold text-on-surface text-sm uppercase tracking-wider">
                    Parámetros de Ejecución
                  </h2>
                  <span className="text-xs text-on-surface-variant font-mono">
                    {selectedSkill.name}
                  </span>
                </div>

                {/* Existing Parameters */}
                {parameters.length > 0 ? (
                  <div className="space-y-3 mb-6">
                    {parameters.map((param, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-3 p-3 bg-surface-container-low rounded"
                      >
                        <div className="p-2 bg-surface-container rounded">
                          {getTypeIcon(param.type)}
                        </div>
                        <div className="flex-1">
                          <input
                            type="text"
                            value={param.name}
                            onChange={(e) => handleUpdateParameter(index, 'name', e.target.value)}
                            className="w-full bg-transparent text-sm font-mono text-on-surface focus:outline-none"
                          />
                          <span className="text-xs text-on-surface-variant uppercase">
                            {param.type} {param.required && '• REQUIRED'}
                          </span>
                        </div>
                        <select
                          value={param.type}
                          onChange={(e) => handleUpdateParameter(index, 'type', e.target.value)}
                          className="px-2 py-1 bg-surface-container rounded text-xs text-on-surface"
                        >
                          <option value="string">String</option>
                          <option value="number">Number</option>
                          <option value="boolean">Boolean</option>
                          <option value="array">Array</option>
                        </select>
                        <label className="flex items-center gap-1 text-xs text-on-surface-variant">
                          <input
                            type="checkbox"
                            checked={param.required}
                            onChange={(e) => handleUpdateParameter(index, 'required', e.target.checked)}
                            className="rounded"
                          />
                          Req
                        </label>
                        <button
                          onClick={() => handleRemoveParameter(index)}
                          className="p-1 hover:bg-surface-container-high rounded"
                        >
                          <Trash2 className="w-4 h-4 text-error" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-on-surface-variant text-sm mb-6">
                    No hay parámetros configurados
                  </p>
                )}

                {/* Add New Parameter */}
                <div className="border-t border-outline-variant/15 pt-4">
                  <h3 className="text-xs uppercase tracking-wider text-on-surface-variant mb-3">
                    Nuevo Parámetro
                  </h3>
                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      value={newParamName}
                      onChange={(e) => setNewParamName(e.target.value)}
                      placeholder="Nombre del parámetro"
                      className="flex-1 px-3 py-2 bg-surface-container-low rounded text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <select
                      value={newParamType}
                      onChange={(e) => setNewParamType(e.target.value as any)}
                      className="px-3 py-2 bg-surface-container-low rounded text-sm text-on-surface"
                    >
                      <option value="string">String</option>
                      <option value="number">Number</option>
                      <option value="boolean">Boolean</option>
                      <option value="array">Array</option>
                    </select>
                    <label className="flex items-center gap-1 text-xs text-on-surface-variant">
                      <input
                        type="checkbox"
                        checked={newParamRequired}
                        onChange={(e) => setNewParamRequired(e.target.checked)}
                        className="rounded"
                      />
                      Requerido
                    </label>
                    <button
                      onClick={handleAddParameter}
                      disabled={!newParamName.trim()}
                      className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50"
                    >
                      <Plus className="w-4 h-4" />
                      AGREGAR
                    </button>
                  </div>
                </div>
              </div>

              {/* Save Button */}
              <div className="flex justify-end">
                <button
                  onClick={handleSave}
                  className="btn-primary flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  GUARDAR CAMBIOS
                </button>
              </div>
            </>
          )}

          {!selectedSkill && skillsList.length > 0 && (
            <div className="bg-surface-container rounded-lg p-12 border border-outline-variant/15 text-center">
              <Zap className="w-12 h-12 text-on-surface-variant mx-auto mb-4 opacity-30" />
              <p className="text-on-surface-variant font-mono text-sm uppercase tracking-wider">
                Selecciona una skill para configurar sus parámetros
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
