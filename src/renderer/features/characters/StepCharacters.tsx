import React, { useState, useCallback } from 'react';
import { Project, ModelConfig, PromptTemplate, Character } from '../../../shared/types';
import { useAIGeneration } from '../../shared/hooks/useAIGeneration';
import AIProgressButton from '../../shared/components/AIProgressButton';

interface StepCharactersProps {
  project: Project;
  prompts: PromptTemplate[];
  activeModel: ModelConfig;
  onUpdate: (updates: Partial<Project>) => void;
  onOpenSettings: () => void;
}

type CharacterTab = 'basic' | 'personality' | 'relationships' | 'ai-test';

const MBTI_OPTIONS = ['INTJ', 'INTP', 'ENTJ', 'ENTP', 'INFJ', 'INFP', 'ENFJ', 'ENFP', 'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ', 'ISTP', 'ISFP', 'ESTP', 'ESFP'];

const StepCharacters: React.FC<StepCharactersProps> = ({
  project,
  prompts,
  activeModel,
  onUpdate,
  onOpenSettings,
}) => {
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<CharacterTab>('basic');
  const { generate, isGenerating, status } = useAIGeneration();

  const selectedCharacter = project.characters.find(c => c.id === selectedCharacterId);

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
      mbti: '',
      coreValues: [],
      speechStyle: '',
      emotionalPatterns: '',
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

  const handleGeneratePersonality = useCallback(async () => {
    if (!selectedCharacter || !activeModel) return;

    const prompt = `基于以下角色基础信息，生成详细的多维性格画像，以JSON格式返回：
{
  "mbti": "MBTI类型（16种之一）",
  "coreValues": ["核心价值观1", "核心价值观2", "核心价值观3"],
  "speechStyle": "说话风格描述（50-100字）",
  "emotionalPatterns": "情绪模式与反应特点（50-100字）",
  "strengths": "核心优势（30-50字）",
  "weaknesses": "致命弱点（30-50字）",
  "motivation": "深层动机（30-50字）"
}

角色信息：
- 姓名：${selectedCharacter.name}
- 性别：${selectedCharacter.gender}
- 年龄：${selectedCharacter.age}
- 角色：${selectedCharacter.role}
- 性格：${selectedCharacter.personality || '未填写'}
- 背景：${selectedCharacter.background || '未填写'}
- 外观：${selectedCharacter.appearance || '未填写'}

仅返回JSON对象，不要其他文字。`;

    const result = await generate({
      model: activeModel,
      prompt,
      temperature: 0.8,
      label: '正在AI生成性格画像...',
    });

    if (result.content && !result.error) {
      try {
        const jsonMatch = result.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const data = JSON.parse(jsonMatch[0]);
          handleUpdateCharacter(selectedCharacter.id, data);
        }
      } catch {
        // 解析失败，不做处理（错误已在 hook 中设置）
      }
    }
  }, [selectedCharacter, activeModel, generate]);

  const tabs: { id: CharacterTab; label: string; icon: string }[] = [
    { id: 'basic', label: '基础信息', icon: 'fa-user' },
    { id: 'personality', label: '性格画像', icon: 'fa-brain' },
    { id: 'relationships', label: '人际关系', icon: 'fa-network-wired' },
    { id: 'ai-test', label: 'AI对话测试', icon: 'fa-comments' },
  ];

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
              <div className="divide-y max-h-[60vh] overflow-y-auto" style={{ borderColor: 'var(--color-border-default)' }}>
                {project.characters.map(char => (
                  <div
                    key={char.id}
                    onClick={() => { setSelectedCharacterId(char.id); setActiveTab('basic'); }}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-all ${
                      selectedCharacterId === char.id ? 'bg-theme-primary-100' : 'hover:bg-white/5'
                    }`}
                    style={{ color: selectedCharacterId === char.id ? undefined : 'var(--color-text-secondary)' }}
                  >
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                      style={{
                        background: selectedCharacterId === char.id
                          ? 'linear-gradient(135deg, var(--color-primary-400), var(--color-primary-600))'
                          : 'linear-gradient(135deg, var(--color-primary-400)/50, var(--color-primary-600)/50)',
                        opacity: selectedCharacterId === char.id ? 1 : 0.6
                      }}
                    >
                      {char.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>{char.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{char.role}</span>
                        {char.mbti && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded font-mono"
                            style={{ backgroundColor: 'var(--color-primary-100)', color: 'var(--color-primary-300)' }}>
                            {char.mbti}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteCharacter(char.id); }}
                      className="transition-colors opacity-0 group-hover:opacity-100"
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
            <div className="glass-card rounded-2xl overflow-hidden">
              {/* 标签式导航 */}
              <div className="flex border-b" style={{ borderColor: 'var(--color-border-default)' }}>
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-4 py-3 text-xs font-medium transition-all relative ${
                      activeTab === tab.id ? '' : 'opacity-60 hover:opacity-80'
                    }`}
                    style={{
                      color: activeTab === tab.id ? 'var(--color-primary-300)' : 'var(--color-text-secondary)',
                      borderBottom: activeTab === tab.id ? '2px solid var(--color-primary-400)' : '2px solid transparent',
                    }}
                  >
                    <i className={`fas ${tab.icon} mr-1.5`} />
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* 内容区域 */}
              <div className="p-6">
                {activeTab === 'basic' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>姓名</label>
                      <input type="text" value={selectedCharacter.name}
                        onChange={(e) => handleUpdateCharacter(selectedCharacter.id, { name: e.target.value })}
                        className="w-full mt-1 neumorphic-input rounded-lg px-4 py-2" />
                    </div>
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>角色类型</label>
                      <select value={selectedCharacter.role}
                        onChange={(e) => handleUpdateCharacter(selectedCharacter.id, { role: e.target.value })}
                        className="w-full mt-1 neumorphic-input rounded-lg px-4 py-2 appearance-none cursor-pointer">
                        <option value="主角">主角</option>
                        <option value="配角">配角</option>
                        <option value="反派">反派</option>
                        <option value="路人">路人</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>性别</label>
                      <input type="text" value={selectedCharacter.gender}
                        onChange={(e) => handleUpdateCharacter(selectedCharacter.id, { gender: e.target.value })}
                        className="w-full mt-1 neumorphic-input rounded-lg px-4 py-2" />
                    </div>
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>年龄</label>
                      <input type="text" value={selectedCharacter.age}
                        onChange={(e) => handleUpdateCharacter(selectedCharacter.id, { age: e.target.value })}
                        className="w-full mt-1 neumorphic-input rounded-lg px-4 py-2" />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>职业</label>
                      <input type="text" value={selectedCharacter.occupation || ''}
                        onChange={(e) => handleUpdateCharacter(selectedCharacter.id, { occupation: e.target.value })}
                        className="w-full mt-1 neumorphic-input rounded-lg px-4 py-2" placeholder="如：学生/法师/侦探..." />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>背景故事</label>
                      <textarea value={selectedCharacter.background}
                        onChange={(e) => handleUpdateCharacter(selectedCharacter.id, { background: e.target.value })}
                        className="w-full mt-1 neumorphic-input rounded-lg px-4 py-2 h-24 resize-none" />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>外观特征</label>
                      <textarea value={selectedCharacter.appearance}
                        onChange={(e) => handleUpdateCharacter(selectedCharacter.id, { appearance: e.target.value })}
                        className="w-full mt-1 neumorphic-input rounded-lg px-4 py-2 h-20 resize-none" />
                    </div>
                  </div>
                )}

                {activeTab === 'personality' && (
                  <div className="space-y-6">
                    {/* AI 生成按钮 */}
                    <div className="flex items-center justify-between p-4 rounded-xl"
                      style={{ backgroundColor: 'var(--color-surface-muted)', border: '1px solid var(--color-border-default)' }}>
                      <div>
                        <h4 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                          <i className="fas fa-wand-magic-sparkles mr-2" style={{ color: 'var(--color-primary-400)' }} />
                          AI 性格画像生成
                        </h4>
                        <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
                          基于基础信息自动生成 MBTI、价值观、说话风格等
                        </p>
                      </div>
                      <AIProgressButton
            onClick={handleGeneratePersonality}
            isGenerating={isGenerating}
            progress={status.progress}
            label="AI 生成画像"
            generatingLabel="分析中..."
            icon="fa-brain"
          />
                    </div>

                    {/* MBTI 类型 */}
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: 'var(--color-text-tertiary)' }}>
                        <i className="fas fa-chart-pie mr-1" />MBTI 性格类型
                      </label>
                      <div className="grid grid-cols-8 gap-2">
                        {MBTI_OPTIONS.map(type => (
                          <button
                            key={type}
                            onClick={() => handleUpdateCharacter(selectedCharacter.id, { mbti: type })}
                            className={`py-1.5 px-2 rounded-lg text-[11px] font-mono font-semibold transition-all ${
                              selectedCharacter.mbti === type
                                ? 'bg-[var(--color-primary-500)] text-white shadow-md'
                                : 'bg-[var(--color-surface-muted)] hover:bg-[var(--color-surface-hover)]'
                            }`}
                            style={{ color: selectedCharacter.mbti === type ? undefined : 'var(--color-text-secondary)' }}
                          >
                            {type}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 核心价值观 */}
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: 'var(--color-text-tertiary)' }}>
                        <i className="fas fa-heart mr-1" />核心价值观
                      </label>
                      <div className="space-y-2">
                        {(selectedCharacter.coreValues as string[] || ['', '', '']).map((value, idx) => (
                          <input
                            key={idx}
                            type="text"
                            value={value}
                            onChange={(e) => {
                              const newValues = [...(selectedCharacter.coreValues as string[] || ['', '', ''])];
                              newValues[idx] = e.target.value;
                              handleUpdateCharacter(selectedCharacter.id, { coreValues: newValues });
                            }}
                            placeholder={`价值观 ${idx + 1}`}
                            className="w-full neumorphic-input rounded-lg px-4 py-2 text-sm"
                          />
                        ))}
                      </div>
                    </div>

                    {/* 说话风格 */}
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: 'var(--color-text-tertiary)' }}>
                        <i className="fas fa-comment mr-1" />说话风格
                      </label>
                      <textarea value={selectedCharacter.speechStyle || ''}
                        onChange={(e) => handleUpdateCharacter(selectedCharacter.id, { speechStyle: e.target.value })}
                        className="w-full neumorphic-input rounded-lg px-4 py-2 h-20 resize-none"
                        placeholder="描述该角色的语言特点：用词习惯、语气、口头禅等..." />
                    </div>

                    {/* 情绪模式 */}
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: 'var(--color-text-tertiary)' }}>
                        <i className="fas fa-wave-square mr-1" />情绪反应模式
                      </label>
                      <textarea value={selectedCharacter.emotionalPatterns || ''}
                        onChange={(e) => handleUpdateCharacter(selectedCharacter.id, { emotionalPatterns: e.target.value })}
                        className="w-full neumorphic-input rounded-lg px-4 py-2 h-20 resize-none"
                        placeholder="描述该角色的情绪特点：什么情况下会生气、如何表达情感等..." />
                    </div>

                    {/* 优势与弱点 */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: 'var(--color-text-tertiary)' }}>
                          <i className="fas fa-star mr-1" />核心优势
                        </label>
                        <textarea value={selectedCharacter.strengths || ''}
                          onChange={(e) => handleUpdateCharacter(selectedCharacter.id, { strengths: e.target.value })}
                          className="w-full neumorphic-input rounded-lg px-4 py-2 h-20 resize-none" />
                      </div>
                      <div>
                        <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: 'var(--color-text-tertiary)' }}>
                          <i className="fas fa-bug mr-1" />致命弱点
                        </label>
                        <textarea value={selectedCharacter.weaknesses || ''}
                          onChange={(e) => handleUpdateCharacter(selectedCharacter.id, { weaknesses: e.target.value })}
                          className="w-full neumorphic-input rounded-lg px-4 py-2 h-20 resize-none" />
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'relationships' && (
                  <div className="space-y-6">
                    {/* 关系文本输入 */}
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: 'var(--color-text-tertiary)' }}>
                        <i className="fas fa-link mr-1" />人物关系描述
                      </label>
                      <textarea value={selectedCharacter.relationships}
                        onChange={(e) => handleUpdateCharacter(selectedCharacter.id, { relationships: e.target.value })}
                        className="w-full neumorphic-input rounded-lg px-4 py-2 h-32 resize-none"
                        placeholder="描述该角色与其他角色的关系..." />
                    </div>

                    {/* 人际关系网络图 */}
                    <div>
                      <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
                        <i className="fas fa-project-diagram mr-2" style={{ color: 'var(--color-primary-400)' }} />
                        人际关系网络
                      </h4>
                      <RelationshipGraph
                        characters={project.characters}
                        selectedId={selectedCharacter.id}
                        onSelectCharacter={setSelectedCharacterId}
                      />
                    </div>
                  </div>
                )}

                {activeTab === 'ai-test' && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl text-center"
                      style={{ backgroundColor: 'var(--color-surface-muted)', border: '1px dashed var(--color-border-default)' }}>
                      <i className="fas fa-robot text-3xl mb-3" style={{ color: 'var(--color-text-muted)', opacity: 0.5 }}></i>
                      <p className="text-sm font-semibold" style={{ color: 'var(--color-text-secondary)' }}>AI 对话一致性测试</p>
                      <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
                        即将推出：模拟该角色在不同情境下的对话反应，检验性格设定的一致性
                      </p>
                    </div>

                    {/* 角色卡片预览 */}
                    <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--color-surface-base)', border: '1px solid var(--color-border-default)' }}>
                      <h4 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--color-text-tertiary)' }}>当前角色档案预览</h4>
                      <div className="space-y-2 text-xs">
                        <div className="flex"><span className="font-semibold w-20 shrink-0" style={{ color: 'var(--color-text-muted)' }}>姓名：</span><span style={{ color: 'var(--color-text-primary)' }}>{selectedCharacter.name}</span></div>
                        <div className="flex"><span className="font-semibold w-20 shrink-0" style={{ color: 'var(--color-text-muted)' }}>MBTI：</span><span className="font-mono px-2 py-0.5 rounded" style={{ backgroundColor: selectedCharacter.mbti ? 'var(--color-primary-100)' : 'transparent', color: selectedCharacter.mbti ? 'var(--color-primary-300)' : 'var(--color-text-tertiary)' }}>{selectedCharacter.mbti || '未设置'}</span></div>
                        <div className="flex"><span className="font-semibold w-20 shrink-0" style={{ color: 'var(--color-text-muted)' }}>价值观：</span><span style={{ color: 'var(--color-text-secondary)' }}>{(selectedCharacter.coreValues as string[])?.filter(Boolean).join(' / ') || '未设置'}</span></div>
                        <div className="flex"><span className="font-semibold w-20 shrink-0" style={{ color: 'var(--color-text-muted)' }}>说话风格：</span><span className="line-clamp-2" style={{ color: 'var(--color-text-secondary)' }}>{selectedCharacter.speechStyle || '未设置'}</span></div>
                      </div>
                    </div>
                  </div>
                )}
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

// ===== 子组件：人际关系网络图 =====
const RelationshipGraph: React.FC<{
  characters: Character[];
  selectedId: string;
  onSelectCharacter: (id: string) => void;
}> = ({ characters, selectedId, onSelectCharacter }) => {
  if (characters.length === 0) return null;

  const selectedChar = characters.find(c => c.id === selectedId);
  const otherChars = characters.filter(c => c.id !== selectedId).slice(0, 8);

  const cx = 200, cy = 200, radius = 120;

  return (
    <div className="flex justify-center p-4 rounded-xl" style={{ backgroundColor: 'var(--color-surface-muted)' }}>
      <svg width="400" height="400" viewBox="0 0 400 400">
        {/* 连接线 */}
        {otherChars.map((char, i) => {
          const angle = (2 * Math.PI * i) / otherChars.length - Math.PI / 2;
          const x = cx + radius * Math.cos(angle);
          const y = cy + radius * Math.sin(angle);
          return (
            <line
              key={char.id}
              x1={cx} y1={cy}
              x2={x} y2={y}
              stroke="var(--color-border-default)"
              strokeWidth={1.5}
              strokeDasharray="4 2"
            />
          );
        })}

        {/* 中心节点 */}
        <g onClick={() => onSelectCharacter(selectedId)} style={{ cursor: 'pointer' }}>
          <circle cx={cx} cy={cy} r={35} fill="var(--color-primary-400)" opacity={0.9} />
          <text x={cx} y={cy + 5} textAnchor="middle" fill="white" fontSize="14" fontWeight="bold">
            {selectedChar?.name.slice(0, 2)}
          </text>
        </g>

        {/* 周围节点 */}
        {otherChars.map((char, i) => {
          const angle = (2 * Math.PI * i) / otherChars.length - Math.PI / 2;
          const x = cx + radius * Math.cos(angle);
          const y = cy + radius * Math.sin(angle);
          return (
            <g key={char.id} onClick={() => onSelectCharacter(char.id)} style={{ cursor: 'pointer' }}>
              <circle cx={x} cy={y} r={25} fill="var(--color-surface-hover)" stroke="var(--color-border-default)" strokeWidth={1.5} />
              <text x={x} y={y + 4} textAnchor="middle" fill="var(--color-text-secondary)" fontSize="11" fontWeight="600">
                {char.name.length > 2 ? char.name.slice(0, 2) : char.name}
              </text>
              <text x={x} y={y + 18} textAnchor="middle" fill="var(--color-text-muted)" fontSize="8">
                {char.role}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export default StepCharacters;
