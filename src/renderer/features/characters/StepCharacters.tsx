import React, { useState } from 'react';
import { Project, ModelConfig, PromptTemplate, Character } from '../../../shared/types';

interface StepCharactersProps {
  project: Project;
  prompts: PromptTemplate[];
  activeModel: ModelConfig;
  onUpdate: (updates: Partial<Project>) => void;
  onOpenSettings: () => void;
}

const StepCharacters: React.FC<StepCharactersProps> = ({
  project,
  prompts,
  activeModel,
  onUpdate,
  onOpenSettings,
}) => {
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);

  const handleAddCharacter = () => {
    const newCharacter: Character = {
      id: Date.now().toString(),
      name: '新角色',
      gender: '未知',
      age: '未知',
      role: '配角',
      personality: '',
      background: '',
      relationships: '',
      appearance: '',
      distinctiveFeatures: '',
      occupation: '',
      motivation: '',
      strengths: '',
      weaknesses: '',
      characterArc: '',
    };
    onUpdate({ characters: [...project.characters, newCharacter] });
    setSelectedCharacterId(newCharacter.id);
  };

  const handleUpdateCharacter = (id: string, updates: Partial<Character>) => {
    onUpdate({
      characters: project.characters.map(c =>
        c.id === id ? { ...c, ...updates } : c
      ),
    });
  };

  const handleDeleteCharacter = (id: string) => {
    onUpdate({
      characters: project.characters.filter(c => c.id !== id),
    });
    if (selectedCharacterId === id) {
      setSelectedCharacterId(null);
    }
  };

  const selectedCharacter = project.characters.find(c => c.id === selectedCharacterId);

  return (
    <div className="p-8 overflow-y-auto h-full">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-black tracking-tight" style={{ color: 'var(--color-text-primary)' }}>角色塑造</h2>
          <p className="mt-2" style={{ color: 'var(--color-text-secondary)' }}>创造鲜活的角色，赋予他们独特的性格与命运。</p>
        </div>
        <button
          onClick={handleAddCharacter}
          className="card-float-hover px-5 py-2.5 text-white rounded-xl transition-all shadow-lg font-medium text-sm"
          style={{ background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))' }}
        >
          <i className="fas fa-plus mr-2"></i>添加角色
        </button>
      </div>

      <div className="flex gap-6 max-w-6xl">
        {/* 角色列表 */}
        <div className="w-72 shrink-0">
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="p-4" style={{ borderBottom: '1px solid var(--color-border-default)' }}>
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>角色列表 ({project.characters.length})</span>
            </div>
            {project.characters.length === 0 ? (
              <div className="p-10 text-center">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--color-primary-400)]/20 to-[var(--color-primary-400)]/10 flex items-center justify-center mx-auto mb-4 border border-[var(--color-primary-200)]">
                  <i className="fas fa-user-plus text-2xl" style={{ color: 'var(--color-primary-400)' }}></i>
                </div>
                <p className="text-sm font-semibold" style={{ color: 'var(--color-text-secondary)' }}>还没有角色</p>
                <p className="text-xs mt-1.5" style={{ color: 'var(--color-text-muted)' }}>点击上方「添加角色」按钮开始创作你的人物</p>
                <button
                  onClick={handleAddCharacter}
                  className="mt-4 px-4 py-1.5 text-xs rounded-lg transition-all card-float-hover text-white"
                  style={{ background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))' }}
                >
                  <i className="fas fa-plus mr-1.5"></i>创建第一个角色
                </button>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: 'var(--color-border-default)' }}>
                {project.characters.map(char => (
                  <div
                    key={char.id}
                    onClick={() => setSelectedCharacterId(char.id)}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-all ${
                      selectedCharacterId === char.id
                        ? 'bg-theme-primary-100 text-theme-primary'
                        : 'hover:bg-white/5'
                    }`}
                    style={{ color: selectedCharacterId === char.id ? undefined : 'var(--color-text-secondary)' }}
                  >
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{
                        background: selectedCharacterId === char.id
                          ? 'linear-gradient(135deg, var(--color-primary-400), var(--color-primary-600))'
                          : 'linear-gradient(135deg, var(--color-primary-400), var(--color-primary-600))',
                        opacity: selectedCharacterId === char.id ? 1 : 0.5
                      }}
                    >
                      {char.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>{char.name}</p>
                      <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{char.role}</p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCharacter(char.id);
                      }}
                      className="transition-colors"
                      style={{ color: 'var(--color-text-tertiary)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
                    >
                      <i className="fas fa-trash text-xs"></i>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 角色详情编辑 */}
        <div className="flex-1">
          {selectedCharacter ? (
            <div className="glass-card rounded-2xl p-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>姓名</label>
                  <input
                    type="text"
                    value={selectedCharacter.name}
                    onChange={(e) => handleUpdateCharacter(selectedCharacter.id, { name: e.target.value })}
                    className="w-full mt-1 neumorphic-input rounded-lg px-4 py-2"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>角色类型</label>
                  <select
                    value={selectedCharacter.role}
                    onChange={(e) => handleUpdateCharacter(selectedCharacter.id, { role: e.target.value })}
                    className="w-full mt-1 neumorphic-input rounded-lg px-4 py-2 appearance-none cursor-pointer"
                  >
                    <option value="主角">主角</option>
                    <option value="配角">配角</option>
                    <option value="反派">反派</option>
                    <option value="路人">路人</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>性别</label>
                  <input
                    type="text"
                    value={selectedCharacter.gender}
                    onChange={(e) => handleUpdateCharacter(selectedCharacter.id, { gender: e.target.value })}
                    className="w-full mt-1 neumorphic-input rounded-lg px-4 py-2"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>年龄</label>
                  <input
                    type="text"
                    value={selectedCharacter.age}
                    onChange={(e) => handleUpdateCharacter(selectedCharacter.id, { age: e.target.value })}
                    className="w-full mt-1 neumorphic-input rounded-lg px-4 py-2"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>性格</label>
                  <textarea
                    value={selectedCharacter.personality}
                    onChange={(e) => handleUpdateCharacter(selectedCharacter.id, { personality: e.target.value })}
                    className="w-full mt-1 neumorphic-input rounded-lg px-4 py-2 h-20 resize-none"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>背景</label>
                  <textarea
                    value={selectedCharacter.background}
                    onChange={(e) => handleUpdateCharacter(selectedCharacter.id, { background: e.target.value })}
                    className="w-full mt-1 neumorphic-input rounded-lg px-4 py-2 h-20 resize-none"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>外观描述</label>
                  <textarea
                    value={selectedCharacter.appearance}
                    onChange={(e) => handleUpdateCharacter(selectedCharacter.id, { appearance: e.target.value })}
                    className="w-full mt-1 neumorphic-input rounded-lg px-4 py-2 h-16 resize-none"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>人物关系</label>
                  <textarea
                    value={selectedCharacter.relationships}
                    onChange={(e) => handleUpdateCharacter(selectedCharacter.id, { relationships: e.target.value })}
                    className="w-full mt-1 neumorphic-input rounded-lg px-4 py-2 h-16 resize-none"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="glass-card rounded-2xl p-12 text-center flex flex-col items-center">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[var(--color-primary-400)]/10 to-[var(--color-primary-400)]/10 flex items-center justify-center mb-5 border border-[var(--color-primary-200)]">
                <i className="fas fa-user-edit text-3xl" style={{ color: 'var(--color-primary-300)', opacity: 0.6 }}></i>
              </div>
              <p className="font-bold text-base" style={{ color: 'var(--color-text-secondary)' }}>选择一个角色</p>
              <p className="text-sm mt-1.5" style={{ color: 'var(--color-text-muted)' }}>从左侧列表选择一个角色编辑详细设定</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StepCharacters;
