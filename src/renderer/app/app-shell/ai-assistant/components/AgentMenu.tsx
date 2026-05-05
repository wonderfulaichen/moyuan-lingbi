import React, { useState } from 'react';
import { AIAgent } from '../../../../../shared/types/fileSystem';
import { aiAssistant } from '../../../../shared/services/AIAssistantService';
import { aiService } from '../../../../shared/services/aiService';
import { ModelConfig } from '../../../../../shared/types';

interface AgentMenuProps {
  agents: AIAgent[];
  activeAgentId: string;
  showAgentMenu: boolean;
  setShowAgentMenu: (v: boolean) => void;
  activeModel: ModelConfig | null;
}

export const AgentMenu: React.FC<AgentMenuProps> = ({ agents, activeAgentId, showAgentMenu, setShowAgentMenu, activeModel }) => {
  const [editingAgent, setEditingAgent] = useState<AIAgent | null>(null);
  const [showAgentEditor, setShowAgentEditor] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [showAiGenDialog, setShowAiGenDialog] = useState(false);
  const [aiGenInput, setAiGenInput] = useState('');
  const [deleteConfirmAgent, setDeleteConfirmAgent] = useState<AIAgent | null>(null);

  const agent = agents.find(a => a.id === activeAgentId) || agents[0];

  return (
    <>
      <button
        onClick={() => setShowAgentMenu(!showAgentMenu)}
        className="flex items-center gap-1.5 px-1.5 py-0.5 rounded-lg transition-all border-none cursor-pointer"
        style={{ background: `${agent.color}15`, color: agent.color }}
        title={`当前智能体：${agent.name}`}
      >
        <i className={`fas ${agent.icon} text-[10px]`} />
        <span className="text-[11px] font-semibold max-w-[80px] truncate">{agent.name}</span>
        <i className={`fas fa-chevron-${showAgentMenu ? 'up' : 'down'} text-[7px] opacity-60`} />
      </button>

      {showAgentMenu && (
        <div className="absolute top-full left-[52px] mt-1 z-50 rounded-xl shadow-xl border overflow-hidden animate-fade-in" style={{
          width: 220, backgroundColor: 'var(--color-surface-base)', borderColor: 'var(--color-border-default)',
        }}>
          <div className="p-1.5 flex flex-col gap-0.5 max-h-[280px] overflow-auto">
            {agents.map(a => {
              const isActive = a.id === activeAgentId;
              return (
                <div key={a.id} className="group relative">
                  <button
                    onClick={() => { aiAssistant.switchAgent(a.id); setShowAgentMenu(false); }}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-all border-none cursor-pointer w-full"
                    style={{ background: isActive ? `${a.color}20` : 'transparent', color: isActive ? a.color : 'var(--color-text-primary)' }}
                  >
                    <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0" style={{ background: `${a.color}20`, color: a.color }}>
                      <i className={`fas ${a.icon} text-[9px]`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-medium leading-tight">{a.name}</p>
                      <p className="text-[8px] opacity-60 truncate">{a.description || '自定义智能体'}</p>
                    </div>
                    {isActive && <i className="fas fa-check text-[8px]" />}
                  </button>
                  {!a.isBuiltIn && (
                    <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto">
                      <button onClick={(e) => { e.stopPropagation(); setEditingAgent({ ...a }); setShowAgentEditor(true); setShowAgentMenu(false); }}
                        title="编辑"
                        className="w-5 h-5 rounded flex items-center justify-center cursor-pointer border-none text-[9px] transition-colors"
                        style={{ color: 'var(--color-text-muted)', background: 'transparent' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--color-primary-400)'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--color-text-muted)'}>
                        <i className="fas fa-pen-to-square" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmAgent(a); }}
                        title="删除"
                        className="w-5 h-5 rounded flex items-center justify-center cursor-pointer border-none text-[9px] transition-colors"
                        style={{ color: 'var(--color-text-muted)', background: 'transparent' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#ef4444'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--color-text-muted)'}>
                        <i className="fas fa-trash-can" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="border-t p-1.5 flex gap-1" style={{ borderColor: 'var(--color-border-default)' }}>
            <button
              onClick={() => {
                setEditingAgent({ id: '', name: '', icon: 'fa-wand-magic-sparkles', color: '', description: '', systemPrompt: '', isBuiltIn: false, createdAt: Date.now() });
                setShowAgentEditor(true);
                setShowAgentMenu(false);
              }}
              className="flex-1 text-[9px] font-medium rounded-lg py-1.5 border-none cursor-pointer transition-all"
              style={{ background: 'var(--color-primary-100)', color: 'var(--color-primary-400)' }}
            >
              <i className="fas fa-plus mr-1" />新建智能体
            </button>
          </div>
        </div>
      )}

      {showAgentEditor && editingAgent && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={e => { if (e.target === e.currentTarget) setShowAgentEditor(false); }}>
          <div className="glass-card rounded-2xl shadow-2xl overflow-hidden animate-fade-in" style={{ width: 480, maxHeight: '85vh', borderColor: editingAgent.color || 'var(--color-primary-400)' }}>
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--color-border-default)', background: `${editingAgent.color || 'var(--color-primary-400)'}08` }}>
              <span className="text-xs font-bold" style={{ color: editingAgent.color || 'var(--color-primary-400)' }}>
                <i className={`fas ${editingAgent.icon || 'fa-wand-magic-sparkles'} mr-1.5`} />
                {editingAgent.id ? '编辑智能体' : '新建智能体'}
              </span>
              <button onClick={() => setShowAgentEditor(false)} className="btn-icon text-[9px]"><i className="fas fa-xmark" /></button>
            </div>
            <div className="p-4 overflow-auto" style={{ maxHeight: 'calc(85vh - 110px)' }}>
              <div className="flex flex-col gap-3">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-[9px] font-medium mb-1 block" style={{ color: 'var(--color-text-muted)' }}>名称</label>
                    <input value={editingAgent.name} onChange={e => setEditingAgent({ ...editingAgent, name: e.target.value })}
                      placeholder="如：修仙世界观专家"
                      className="w-full text-[11px] rounded-lg px-3 py-1.5 outline-none border"
                      style={{ color: 'var(--color-text-primary)', backgroundColor: 'var(--color-surface-muted)', borderColor: 'var(--color-border-default)' }} />
                  </div>
                  <div className="w-24">
                    <label className="text-[9px] font-medium mb-1 block" style={{ color: 'var(--color-text-muted)' }}>颜色</label>
                    <div className="w-full h-[34px] rounded-lg cursor-pointer border relative"
                      style={{ backgroundColor: editingAgent.color || 'var(--color-primary-400)', borderColor: 'var(--color-border-default)' }}>
                      <input type="color" value={editingAgent.color} onChange={e => setEditingAgent({ ...editingAgent, color: e.target.value })}
                        className="absolute inset-0 w-full h-full cursor-pointer opacity-0" />
                    </div>
                  </div>
                </div>

                <div className="rounded-xl p-3 border cursor-pointer transition-all hover:border-opacity-60"
                  onClick={() => { if (!aiGenerating) { if (showAiGenDialog) setShowAiGenDialog(false); else { setAiGenInput(''); setShowAiGenDialog(true); } } }}
                  style={{
                    borderColor: editingAgent.color || 'var(--color-primary-400)',
                    background: `linear-gradient(135deg, ${(editingAgent.color || 'var(--color-primary-400)')}08 0%, ${(editingAgent.color || 'var(--color-primary-400)')}03 100%)`,
                    borderWidth: 1.5, borderStyle: 'dashed',
                  }}>
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${editingAgent.color || 'var(--color-primary-400)'}15` }}>
                      {aiGenerating ? (
                        <i className="fas fa-spinner fa-spin text-[12px]" style={{ color: editingAgent.color || 'var(--color-primary-400)' }} />
                      ) : (
                        <i className="fas fa-wand-magic-sparkles text-[13px]" style={{ color: editingAgent.color || 'var(--color-primary-400)' }} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold" style={{ color: editingAgent.color || 'var(--color-primary-400)' }}>
                        {aiGenerating ? '正在生成中...' : '✨ AI 智能生成'}
                      </p>
                      <p className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>
                        {aiGenerating ? 'AI 正在为你定制智能体...' : '描述你想要的智能体，AI 自动生成名称、图标、提示词等全部配置'}
                      </p>
                    </div>
                    <i className={`fas fa-chevron-${showAiGenDialog ? 'down' : 'right'} text-[10px]`} style={{ color: 'var(--color-text-muted)', opacity: 0.5 }} />
                  </div>
                  {showAiGenDialog && (
                    <div className="mt-2.5 pt-2.5 border-t" style={{ borderColor: `${editingAgent.color || 'var(--color-primary-400)'}20` }} onClick={e => e.stopPropagation()}>
                      <textarea autoFocus value={aiGenInput} onChange={e => setAiGenInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) e.preventDefault(); }}
                        rows={2} placeholder="例如：一个专精东方玄幻世界观的智能体，擅长设计修炼体系和势力格局..."
                        className="w-full text-[11px] rounded-lg px-3 py-2 outline-none border resize-none leading-relaxed"
                        style={{ color: 'var(--color-text-primary)', backgroundColor: 'var(--color-surface-base)', borderColor: 'var(--color-border-default)', fontFamily: 'inherit' }} />
                      <div className="flex justify-end mt-2">
                        <button disabled={!aiGenInput.trim() || aiGenerating}
                          onClick={async () => {
                            if (!aiGenInput.trim()) return;
                            setShowAiGenDialog(false);
                            setAiGenerating(true);
                            try {
                              const prompt = `你是一个AI智能体配置生成器。请根据以下描述，生成一个完整的小说创作助手智能体配置。\n\n用户需求：${aiGenInput}\n\n请严格按以下JSON格式输出，不要输出任何其他内容（只输出JSON）：\n{"name":"智能体名称","icon":"Font Awesome图标名如fa-dragon","color":"十六进制颜色如#8b5cf6","description":"一句话简介","systemPrompt":"完整的系统提示词，包含##核心能力和##行为准则等章节"}`;
                              const result = await aiService.generateWithContext({
                                model: activeModel || { id: 'fallback', name: 'DeepSeek', provider: 'deepseek', modelName: 'deepseek-chat' },
                                prompt, temperature: 0.8,
                              });
                              if (!result.error && result.content) {
                                const jsonMatch = result.content.match(/\{[\s\S]*\}/);
                                if (jsonMatch) {
                                  const config = JSON.parse(jsonMatch[0]);
                                  setEditingAgent(prev => prev ? {
                                    ...prev, name: config.name || prev.name, icon: config.icon || prev.icon,
                                    color: config.color || prev.color, description: config.description || prev.description,
                                    systemPrompt: config.systemPrompt || prev.systemPrompt,
                                  } : prev);
                                }
                              }
                            } catch {} 
                            setAiGenerating(false);
                          }}
                          className="text-[10px] font-semibold px-4 py-1.5 rounded-lg border-none cursor-pointer text-white shadow-sm flex items-center gap-1.5"
                          style={{ background: editingAgent.color || 'var(--color-primary-400)', opacity: (!aiGenInput.trim() || aiGenerating) ? 0.45 : 1 }}
                        >
                          <i className="fas fa-sparkles text-[9px]" />开始生成
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-[9px] font-medium mb-1 block" style={{ color: 'var(--color-text-muted)' }}>图标</label>
                  <input value={editingAgent.icon} onChange={e => setEditingAgent({ ...editingAgent, icon: e.target.value })}
                    placeholder="fa-dragon / fa-hat-wizard / fa-scroll ..."
                    className="w-full text-[11px] rounded-lg px-3 py-1.5 outline-none border font-mono"
                    style={{ color: 'var(--color-text-primary)', backgroundColor: 'var(--color-surface-muted)', borderColor: 'var(--color-border-default)' }} />
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {['fa-wand-magic-sparkles', 'fa-dragon', 'fa-hat-wizard', 'fa-scroll', 'fa-masks-theater', 'fa-pen-nib', 'fa-shield-halved', 'fa-gem', 'fa-crown', 'fa-fire', 'fa-bolt', 'fa-star'].map(icon => (
                      <button key={icon} onClick={() => setEditingAgent({ ...editingAgent, icon })}
                        className="w-7 h-7 rounded-md flex items-center justify-center border transition-all cursor-pointer"
                        style={{
                          background: editingAgent.icon === icon ? `${editingAgent.color}20` : 'transparent',
                          borderColor: editingAgent.icon === icon ? editingAgent.color : 'var(--color-border-default)',
                          color: editingAgent.icon === icon ? editingAgent.color : 'var(--color-text-muted)',
                        }} title={icon.replace('fa-', '')}>
                        <i className={`fas ${icon} text-[10px]`} />
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[9px] font-medium mb-1 block" style={{ color: 'var(--color-text-muted)' }}>简介</label>
                  <input value={editingAgent.description} onChange={e => setEditingAgent({ ...editingAgent, description: e.target.value })}
                    placeholder="一句话描述这个智能体的专长..."
                    className="w-full text-[11px] rounded-lg px-3 py-1.5 outline-none border"
                    style={{ color: 'var(--color-text-primary)', backgroundColor: 'var(--color-surface-muted)', borderColor: 'var(--color-border-default)' }} />
                </div>
                <div>
                  <label className="text-[9px] font-medium mb-1 block" style={{ color: 'var(--color-text-muted)' }}>系统提示词（定义 AI 的行为和专长）</label>
                  <textarea value={editingAgent.systemPrompt} onChange={e => setEditingAgent({ ...editingAgent, systemPrompt: e.target.value })}
                    rows={8} placeholder={`你是...专家。\n\n## 核心能力\n- ...\n\n## 行为准则\n- ...`}
                    className="w-full text-[11px] rounded-lg px-3 py-2 outline-none border resize-none leading-relaxed"
                    style={{ color: 'var(--color-text-primary)', backgroundColor: 'var(--color-surface-muted)', borderColor: 'var(--color-border-default)', fontFamily: 'inherit' }} />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t" style={{ borderColor: 'var(--color-border-default)' }}>
              <button onClick={() => setShowAgentEditor(false)} className="btn-outline-muted text-[10px] rounded-lg px-4 py-1.5">取消</button>
              {!editingAgent.isBuiltIn && editingAgent.id && (
                <button onClick={() => { aiAssistant.deleteAgent(editingAgent.id!); setShowAgentEditor(false); }}
                  className="text-[10px] rounded-lg px-3 py-1.5 border-none cursor-pointer text-white"
                  style={{ background: '#ef4444' }}>删除</button>
              )}
              <button disabled={!editingAgent.name.trim()}
                onClick={() => {
                  if (editingAgent.id) {
                    aiAssistant.updateAgent(editingAgent.id, { name: editingAgent.name, icon: editingAgent.icon, color: editingAgent.color, description: editingAgent.description, systemPrompt: editingAgent.systemPrompt });
                  } else {
                    aiAssistant.createAgent({ name: editingAgent.name, icon: editingAgent.icon, color: editingAgent.color, description: editingAgent.description, systemPrompt: editingAgent.systemPrompt });
                  }
                  setShowAgentEditor(false);
                }}
                className="text-[10px] font-semibold rounded-lg px-4 py-1.5 border-none cursor-pointer text-white shadow-sm"
                style={{ background: editingAgent.color || 'var(--color-primary-400)', opacity: editingAgent.name.trim() ? 1 : 0.45 }}
              >
                {editingAgent.id ? '保存修改' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmAgent && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={() => setDeleteConfirmAgent(null)}>
          <div className="glass-card rounded-2xl shadow-2xl overflow-hidden animate-fade-in" style={{ width: 360 }}>
            <div className="px-5 py-4 flex items-start gap-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: '#fef2f2', color: '#ef4444' }}>
                <i className="fas fa-triangle-exclamation text-[14px]" />
              </div>
              <div>
                <p className="text-[13px] font-bold mb-1" style={{ color: 'var(--color-text-primary)' }}>删除智能体</p>
                <p className="text-[11px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                  确定要删除智能体 <span className="font-semibold" style={{ color: deleteConfirmAgent.color || 'var(--color-primary-400)' }}>「{deleteConfirmAgent.name}」</span> 吗？此操作不可撤销。
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t" style={{ borderColor: 'var(--color-border-default)', background: 'var(--color-surface-muted)' }}>
              <button onClick={() => setDeleteConfirmAgent(null)}
                className="btn-outline-muted text-[10px] rounded-lg px-4 py-1.5">取消</button>
              <button onClick={() => { aiAssistant.deleteAgent(deleteConfirmAgent.id); setDeleteConfirmAgent(null); }}
                className="text-[10px] font-semibold rounded-lg px-4 py-1.5 border-none cursor-pointer text-white shadow-sm"
                style={{ background: '#ef4444' }}>确认删除</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
