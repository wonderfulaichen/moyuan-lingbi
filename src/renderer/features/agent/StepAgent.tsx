/**
 * StepAgent — Agent 对话驱动创作界面
 *
 * 三栏布局：
 * - 左栏：真实项目文件树（来自 DataService）
 * - 中栏：Agent 对话（接入真实 aiAssistant 服务）
 * - 右栏：图示（角色关系/世界观/时间线）+ 概览（文件/Agent状态）
 *
 * 2026-06-07: 从 mock 数据切换到真实 AI 服务
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { aiAssistant } from '../../shared/services/ai-assistant';
import { dataService } from '../../shared/services/DataService';
import type { AIChatMessage, AIAssistantState } from '../../../shared/types/fileSystem';

// ============================================================
// 类型
// ============================================================

type AgentType = 'writer' | 'auditor' | 'revisor' | 'system';
type RightTab = 'diagram' | 'overview';

interface BookNode {
  id: string;
  title: string;
  files: { id: string; name: string }[];
  isExpanded?: boolean;
}

// ============================================================
// Agent 颜色
// ============================================================


// ============================================================
// 左栏：文件树
// ============================================================

function FileTree({ books, activeFileId, onSelectFile, onToggleBook, onCreateFile, onNewProject }: {
  books: BookNode[]; activeFileId: string;
  onSelectFile: (id: string) => void; onToggleBook: (id: string) => void;
  onCreateFile: (bookId: string) => void; onNewProject: () => void;
}) {
  return (
    <div style={{ width: 170, background: 'var(--color-background-primary)', borderRight: '0.5px solid var(--color-border-tertiary)', display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden' }}>
      <div style={{ padding: '6px 10px', borderBottom: '0.5px solid var(--color-border-tertiary)', display: 'flex', gap: 4 }}>
        <button onClick={onNewProject} style={{ padding: '3px 8px', background: '#534AB7', border: 'none', borderRadius: 3, fontSize: 9, color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
          <svg width="8" height="8" viewBox="0 0 16 16" fill="none"><path d="M8 3V13M3 8H13" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>
          新建
        </button>
        <button style={{ padding: '3px 8px', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 3, fontSize: 9, color: 'var(--color-text-secondary)', cursor: 'pointer' }}>模板</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 6px' }}>
        <p style={{ fontSize: 8, color: 'var(--color-text-secondary)', margin: '0 0 4px 4px' }}>项目文件</p>
        {books.map((book) => (
          <div key={book.id} style={{ marginBottom: 2 }}>
            <div onClick={() => onToggleBook(book.id)} style={{ padding: '3px 4px', borderRadius: 3, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ fontSize: 7, color: 'var(--color-text-tertiary)' }}>{book.isExpanded !== false ? '▾' : '▸'}</span>
              <svg width="8" height="8" viewBox="0 0 16 16" fill="none"><path d="M2 3H14V13H2V3Z" stroke="#534AB7" strokeWidth="1.2"/><path d="M2 3L8 5L14 3" stroke="#534AB7" strokeWidth="1.2"/></svg>
              <span style={{ fontSize: 9, color: 'var(--color-text-primary)', flex: 1 }}>{book.title}</span>
            </div>
            {book.isExpanded !== false && (
              <div style={{ paddingLeft: 12 }}>
                {book.files.map((f) => (
                  <div key={f.id} onClick={() => onSelectFile(f.id)} style={{ padding: '2px 4px', borderRadius: 2, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, background: activeFileId === f.id ? '#EEEDFE' : 'transparent' }}>
                    <svg width="6" height="6" viewBox="0 0 16 16" fill="none"><path d="M4 2H10L12 4V14H4V2Z" stroke={activeFileId === f.id ? '#534AB7' : 'var(--color-text-tertiary)'} strokeWidth="1"/></svg>
                    <span style={{ fontSize: 8, color: activeFileId === f.id ? '#534AB7' : 'var(--color-text-secondary)' }}>{f.name}</span>
                  </div>
                ))}
                <button onClick={() => onCreateFile(book.id)} style={{ padding: '2px 4px', borderRadius: 2, display: 'flex', alignItems: 'center', gap: 3, background: 'none', border: 'none', cursor: 'pointer', width: '100%', fontSize: 8, color: 'var(--color-text-tertiary)' }}>
                  <svg width="6" height="6" viewBox="0 0 16 16" fill="none"><path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/></svg>
                  新建文件
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// 消息气泡（适配 AIChatMessage）
// ============================================================

// Agent ID → 显示颜色映射
const AGENT_DISPLAY: Record<string, { bg: string; text: string; label: string; icon: string }> = {
  'agent-general': { bg: '#EEEDFE', text: '#534AB7', label: '创作助手', icon: 'W' },
  'agent-worldbuilder': { bg: '#D1FAE5', text: '#065F46', label: '世界观架构师', icon: 'G' },
  'agent-character': { bg: '#DBEAFE', text: '#1E40AF', label: '角色设计师', icon: 'C' },
  'agent-plotter': { bg: '#FEF3C7', text: '#92400E', label: '剧情策划师', icon: 'P' },
  'agent-editor': { bg: '#FCE7F3', text: '#9D174D', label: '文字润色师', icon: 'E' },
  'agent-sub-writer': { bg: '#EEEDFE', text: '#534AB7', label: '章节写手', icon: 'W' },
  'agent-sub-reviewer': { bg: '#FAEEDA', text: '#BA7517', label: '审校员', icon: 'A' },
  'agent-sub-planner': { bg: '#FEF3C7', text: '#92400E', label: '大纲规划师', icon: 'P' },
  'agent-sub-researcher': { bg: '#DBEAFE', text: '#1E40AF', label: '资料研究员', icon: 'R' },
  'agent-sub-memory': { bg: '#FCE7F3', text: '#9D174D', label: '记忆整理专家', icon: 'M' },
};

function MessageBubble({ msg }: { msg: AIChatMessage }) {
  const isUser = msg.role === 'user';
  const isAssistant = msg.role === 'assistant';
  const display = (msg.agentType && AGENT_DISPLAY[msg.agentType]) || (isAssistant ? AGENT_DISPLAY['agent-general'] : null);

  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
      {!isUser && display && (
        <div style={{ width: 18, height: 18, borderRadius: 3, background: display.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 7, fontWeight: 600, color: display.text }}>
          {display.icon}
        </div>
      )}
      <div style={{ maxWidth: '75%' }}>
        {!isUser && display && <p style={{ fontSize: 8, color: display.text, margin: '0 0 2px 0' }}>{display.label}</p>}
        <div style={{ background: isUser ? '#EEEDFE' : 'var(--color-background-primary)', borderRadius: 6, padding: '6px 10px', border: '0.5px solid var(--color-border-tertiary)' }}>
          <p style={{ fontSize: 10, color: 'var(--color-text-primary)', margin: 0, lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>{msg.content}</p>
          {msg.thinking && (
            <details style={{ marginTop: 6 }}><summary style={{ fontSize: 8, color: 'var(--color-text-tertiary)', cursor: 'pointer' }}>思考过程</summary>
              <p style={{ fontSize: 8, color: 'var(--color-text-tertiary)', margin: '4px 0 0 0', lineHeight: 1.4 }}>{msg.thinking}</p>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 右栏
// ============================================================

function RightPanel({ rightTab, onTabChange, width, onCollapse, agentState, activeFile }: {
  rightTab: RightTab; onTabChange: (t: RightTab) => void;
  width: number; onCollapse: () => void;
  agentState: AIAssistantState; activeFile: { id: string; name: string } | null;
}) {
  const { isProcessing, streamingContent } = agentState;

  return (
    <div style={{ width, background: 'var(--color-background-primary)', borderLeft: '0.5px solid var(--color-border-tertiary)', flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
        <button onClick={() => onTabChange('diagram')} style={{ flex: 1, fontSize: 8, padding: '5px 4px', background: rightTab === 'diagram' ? '#EEEDFE' : 'transparent', color: rightTab === 'diagram' ? '#534AB7' : 'var(--color-text-secondary)', border: 'none', borderBottom: rightTab === 'diagram' ? '2px solid #534AB7' : '2px solid transparent', cursor: 'pointer' }}>图示</button>
        <button onClick={() => onTabChange('overview')} style={{ flex: 1, fontSize: 8, padding: '5px 4px', background: rightTab === 'overview' ? '#EEEDFE' : 'transparent', color: rightTab === 'overview' ? '#534AB7' : 'var(--color-text-secondary)', border: 'none', borderBottom: rightTab === 'overview' ? '2px solid #534AB7' : '2px solid transparent', cursor: 'pointer' }}>概览</button>
        <button onClick={onCollapse} style={{ width: 20, fontSize: 8, padding: '5px 0', background: 'transparent', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer' }}>✕</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
        {rightTab === 'diagram' ? (
          <>
            <div style={{ display: 'flex', gap: 3, marginBottom: 6 }}>
              {['角色', '世界观', '时间线'].map((l, i) => (
                <button key={l} style={{ fontSize: 7, padding: '2px 5px', borderRadius: 2, background: i === 0 ? '#EEEDFE' : 'var(--color-background-secondary)', color: i === 0 ? '#534AB7' : 'var(--color-text-secondary)', border: i === 0 ? 'none' : '0.5px solid var(--color-border-tertiary)' }}>{l}</button>
              ))}
            </div>
            <div style={{ background: 'var(--color-background-secondary)', borderRadius: 5, padding: 6, border: '0.5px solid var(--color-border-tertiary)', marginBottom: 8 }}>
              <svg width="100%" viewBox="0 0 170 90" fill="none">
                <circle cx="85" cy="15" r="10" fill="#EEEDFE" stroke="#534AB7" strokeWidth="0.5"/>
                <text x="85" y="17" textAnchor="middle" fontSize="7" fill="#534AB7">主角</text>
                <circle cx="30" cy="50" r="9" fill="#FAEEDA" stroke="#BA7517" strokeWidth="0.5"/>
                <text x="30" y="52" textAnchor="middle" fontSize="6" fill="#BA7517">老者</text>
                <circle cx="85" cy="65" r="9" fill="#E1F5EE" stroke="#1D9E75" strokeWidth="0.5"/>
                <text x="85" y="67" textAnchor="middle" fontSize="6" fill="#1D9E75">狼王</text>
                <circle cx="140" cy="50" r="9" fill="#FBEAF0" stroke="#D4537E" strokeWidth="0.5"/>
                <text x="140" y="52" textAnchor="middle" fontSize="6" fill="#D4537E">同伴</text>
                <line x1="73" y1="23" x2="40" y2="41" stroke="#BA7517" strokeWidth="0.5" strokeDasharray="2,2"/>
                <line x1="85" y1="25" x2="85" y2="56" stroke="#1D9E75" strokeWidth="0.5"/>
                <line x1="97" y1="23" x2="130" y2="41" stroke="#D4537E" strokeWidth="0.5" strokeDasharray="2,2"/>
              </svg>
            </div>
          </>
        ) : (
          <>
            <div style={{ marginBottom: 10 }}>
              <p style={{ fontSize: 8, color: 'var(--color-text-secondary)', margin: '0 0 4px 0' }}>当前文件</p>
              <div style={{ background: 'var(--color-background-secondary)', borderRadius: 4, padding: '5px 6px', border: '0.5px solid var(--color-border-tertiary)' }}>
                <p style={{ fontSize: 9, fontWeight: 500, color: 'var(--color-text-primary)', margin: 0 }}>{activeFile?.name || '未选择'}</p>
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <p style={{ fontSize: 8, color: 'var(--color-text-secondary)', margin: '0 0 4px 0' }}>AI 状态</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 5px', background: '#EEEDFE', borderRadius: 3 }}>
                  <div style={{ width: 4, height: 4, borderRadius: '50%', background: isProcessing ? '#BA7517' : '#1D9E75' }} />
                  <span style={{ fontSize: 8, color: '#534AB7' }}>AI 助手</span>
                  <span style={{ fontSize: 7, color: '#534AB7', marginLeft: 'auto' }}>{isProcessing ? '处理中' : '就绪'}</span>
                </div>
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <p style={{ fontSize: 8, color: 'var(--color-text-secondary)', margin: '0 0 4px 0' }}>当前任务</p>
              <div style={{ background: 'var(--color-background-secondary)', borderRadius: 4, padding: 6, border: '0.5px solid var(--color-border-tertiary)' }}>
                <p style={{ fontSize: 8, color: 'var(--color-text-secondary)', margin: 0 }}>{agentState.agentState.currentTask || '等待指令'}</p>
              </div>
            </div>
            {agentState.agentState.error && (
              <div style={{ marginBottom: 10 }}>
                <p style={{ fontSize: 8, color: 'var(--color-text-secondary)', margin: '0 0 4px 0' }}>错误</p>
                <div style={{ background: '#FCEBEB', borderRadius: 4, padding: 6 }}>
                  <p style={{ fontSize: 8, color: '#E24B4A', margin: 0 }}>{agentState.agentState.error}</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// 输入栏（接入真实 aiAssistant.sendMessage）
// ============================================================

function InputBar({ agents, activeAgentId, onSend, onAgentChange }: {
  agents: { id: string; name: string }[]; activeAgentId: string;
  onSend: (msg: string) => void; onAgentChange: (a: string) => void;
}) {
  const [value, setValue] = useState('');
  const [showAgentPicker, setShowAgentPicker] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const activeAgent = agents.find(a => a.id === activeAgentId) || agents[0];

  const doSend = () => {
    if (!value.trim()) return;
    onSend(value.trim());
    setValue('');
  };

  return (
    <div style={{ background: 'var(--color-background-primary)', borderTop: '0.5px solid var(--color-border-tertiary)' }}>
      <div style={{ padding: '6px 12px 4px', display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative' }}>
          <span onClick={() => setShowAgentPicker(!showAgentPicker)}
            style={{ fontSize: 8, padding: '2px 5px', background: '#EEEDFE', color: '#534AB7', borderRadius: 2, display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer' }}>
            <svg width="7" height="7" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5" stroke="#534AB7" strokeWidth="1.2"/></svg>
            {activeAgent?.name || 'AI 助手'}
            <svg width="6" height="6" viewBox="0 0 16 16" fill="none"><path d="M4 6L8 10L12 6" stroke="#534AB7" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </span>
          {showAgentPicker && (
            <div style={{ position: 'absolute', bottom: '100%', left: 0, background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 4, padding: 4, zIndex: 100, minWidth: 140, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
              {agents.map(a => (
                <div key={a.id} onClick={() => { onAgentChange(a.id); setShowAgentPicker(false); }}
                  style={{ padding: '3px 6px', borderRadius: 3, cursor: 'pointer', background: a.id === activeAgentId ? '#EEEDFE' : 'transparent', fontSize: 8, color: '#534AB7' }}>
                  {a.name}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div style={{ padding: '0 12px 6px' }}>
        <div style={{ display: 'flex', gap: 4, background: 'var(--color-background-secondary)', borderRadius: 6, border: '0.5px solid var(--color-border-tertiary)', padding: '6px 8px' }}>
          <input ref={ref} value={value} onChange={e => setValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); } }} placeholder="输入创作指令..." style={{ flex: 1, fontSize: 10, color: 'var(--color-text-primary)', background: 'transparent', border: 'none', outline: 'none' }} />
          <button onClick={doSend} style={{ width: 24, height: 20, borderRadius: 4, background: '#534AB7', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <svg width="9" height="9" viewBox="0 0 16 16" fill="none"><path d="M3 8L7 12L13 4" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 主组件
// ============================================================

export default function StepAgent() {
  const [assistantState, setAssistantState] = useState<AIAssistantState>(() => aiAssistant.getState());
  const [rightTab, setRightTab] = useState<RightTab>('overview');
  const [rightWidth, setRightWidth] = useState(220);
  const [isRightVisible, setIsRightVisible] = useState(true);
  const [activeFileId, setActiveFileId] = useState('');
  const [fileTreeVersion, setFileTreeVersion] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // 订阅 aiAssistant + dataService 状态变化
  useEffect(() => {
    const unsub1 = aiAssistant.subscribe((state) => setAssistantState({ ...state }));
    const unsub2 = dataService.subscribe(() => setFileTreeVersion(v => v + 1));
    aiAssistant.ensureActiveProjectLoaded();
    return () => { unsub1(); unsub2(); };
  }, []);

  // 滚动到底部
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [assistantState.messages, assistantState.streamingContent]);

  // 构建项目文件树（真实数据）
  const books = useMemo<BookNode[]>(() => {
    const project = dataService.getActiveProject();
    if (!project) return [];
    const fs = dataService.getFS();
    if (!fs) return [{ id: 'default', title: project.title, files: [], isExpanded: true }];

    const allFiles = fs.files || {};

    // 递归收集所有文件（支持嵌套文件夹）
    function collectFiles(parentId: string): { id: string; name: string }[] {
      const parent = allFiles[parentId];
      if (!parent || parent.type !== 'folder') return [];
      const result: { id: string; name: string }[] = [];
      for (const childId of parent.childrenIds || []) {
        const child = allFiles[childId];
        if (!child) continue;
        if (child.type === 'file') {
          result.push({ id: child.id, name: child.name });
        } else if (child.type === 'folder') {
          // 把子文件夹名加斜杠前缀，表示这是文件夹内的文件
          const subFiles = collectFiles(child.id);
          for (const sf of subFiles) {
            result.push({ id: sf.id, name: `${child.name}/${sf.name}` });
          }
        }
      }
      return result;
    }

    // 把项目本身作为一个 "书"，根文件夹展开
    const allProjectFiles = fs.rootIds.flatMap(rootId => {
      const folder = allFiles[rootId];
      if (!folder) return [];
      // 文件夹本身作为列表标题
      return [
        { id: rootId, name: `📁 ${folder.name}`, isFolder: true },
        ...collectFiles(rootId),
      ];
    });

    return [{
      id: project.id,
      title: project.title,
      files: allProjectFiles,
      isExpanded: true,
    }];
  }, [fileTreeVersion]); // dataService 变化时重新加载

  // 获取活跃模型
  const activeModel = useMemo(() => {
    const models = dataService.getModels();
    const data = dataService.getData();
    return models.find(m => m.id === data.activeModelId) || models[0];
  }, []);

  // 发送消息
  const handleSend = useCallback((text: string) => {
    if (!activeModel) return;
    aiAssistant.ensureActiveProjectLoaded();
    aiAssistant.sendMessage(text, activeModel);
  }, [activeModel]);

  // 当前打开的文件
  const activeFile = useMemo(() => {
    for (const b of books) {
      const f = b.files.find(f => f.id === activeFileId);
      if (f) return f;
    }
    return null;
  }, [books, activeFileId]);

  // AI Agent 列表（来自 aiAssistant）
  const agents = useMemo(() => {
    return assistantState.agents || [];
  }, [assistantState.agents]);

  // 切换 Agent
  const handleAgentChange = useCallback((agentId: string) => {
    aiAssistant.switchAgent(agentId);
  }, []);

  // 流式内容（当前正在生成的回复）
  const streamingMsg = assistantState.streamingContent;
  const isProcessing = assistantState.isProcessing;

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* 对话区 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--color-background-secondary)' }}>
        <div style={{ padding: '5px 12px', borderBottom: '0.5px solid var(--color-border-tertiary)', display: 'flex', alignItems: 'center', gap: 4, background: 'var(--color-background-primary)' }}>
          <svg width="8" height="8" viewBox="0 0 16 16" fill="none"><path d="M4 2H10L12 4V14H4V2Z" stroke="var(--color-text-secondary)" strokeWidth="1"/></svg>
          <span style={{ fontSize: 9, fontWeight: 500, color: 'var(--color-text-primary)' }}>{activeFile?.name || '对话'}</span>
          <div style={{ flex: 1 }} />
          {isProcessing && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 6px', background: '#EEEDFE', borderRadius: 2 }}>
              <div style={{ display: 'flex', gap: 1 }}>
                {[0, 1, 2].map(i => <div key={i} style={{ width: 3, height: 3, borderRadius: '50%', background: '#534AB7', animation: 'pulse 1s infinite', animationDelay: `${i * 200}ms` }} />)}
              </div>
              <span style={{ fontSize: 8, color: '#534AB7' }}>AI 生成中...</span>
            </div>
          )}
          {!isRightVisible && (
            <button onClick={() => setIsRightVisible(true)} style={{ fontSize: 8, padding: '2px 4px', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 2, cursor: 'pointer', color: 'var(--color-text-secondary)' }}>☰</button>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {assistantState.messages.length === 0 && !isProcessing && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8 }}>
              <svg width="24" height="24" viewBox="0 0 16 16" fill="none"><path d="M12.5 2.5L6 9L4 12L3 13.5L4.5 11.5L7.5 9.5L13.5 3.5L12.5 2.5Z" stroke="#534AB7" strokeWidth="1.2"/></svg>
              <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: 0 }}>输入指令开始创作...</p>
            </div>
          )}
          {assistantState.messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} />
          ))}
          {streamingMsg && (
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ width: 18, height: 18, borderRadius: 3, background: '#EEEDFE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="9" height="9" viewBox="0 0 16 16" fill="none"><path d="M12.5 2.5L6 9L4 12L3 13.5L4.5 11.5L7.5 9.5L13.5 3.5L12.5 2.5Z" stroke="#534AB7" strokeWidth="1.2"/></svg>
              </div>
              <div style={{ maxWidth: '75%' }}>
                <div style={{ background: 'var(--color-background-primary)', borderRadius: 6, padding: '6px 10px', border: '0.5px solid var(--color-border-tertiary)' }}>
                  <p style={{ fontSize: 10, color: 'var(--color-text-primary)', margin: 0, whiteSpace: 'pre-wrap' }}>{streamingMsg}</p>
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <InputBar agents={agents} activeAgentId={assistantState.activeAgentId} onSend={handleSend} onAgentChange={handleAgentChange} />
      </div>

      {isRightVisible && (
        <>
          <div onMouseDown={(e) => { const sx = e.clientX, sw = rightWidth; const m = (ev: MouseEvent) => setRightWidth(Math.max(160, Math.min(350, sw + sx - ev.clientX))); const u = () => { document.removeEventListener('mousemove', m); document.removeEventListener('mouseup', u); }; document.addEventListener('mousemove', m); document.addEventListener('mouseup', u); e.preventDefault(); }} style={{ width: 2, background: 'var(--color-border-tertiary)', cursor: 'col-resize', flexShrink: 0 }} />
          <RightPanel rightTab={rightTab} onTabChange={setRightTab} width={rightWidth} onCollapse={() => setIsRightVisible(false)} agentState={assistantState} activeFile={activeFile} />
        </>
      )}
    </div>
  );
}
