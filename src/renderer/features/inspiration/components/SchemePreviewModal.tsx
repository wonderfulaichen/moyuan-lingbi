import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { NovelScheme } from '../../../../shared/types';
import { ConfirmModal } from '../../../shared/components/Modal';

interface SchemePreviewModalProps {
  scheme: NovelScheme;
  index: number;
  onClose: () => void;
  onSave: (updatedScheme: NovelScheme) => void;
}

const SchemePreviewModal: React.FC<SchemePreviewModalProps> = ({ scheme, index, onClose, onSave }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedScheme, setEditedScheme] = useState<NovelScheme>({ ...scheme });
  const [hasChanges, setHasChanges] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  useEffect(() => {
    setEditedScheme({ ...scheme });
    setIsEditing(false);
    setHasChanges(false);
  }, [scheme]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isEditing && hasChanges) {
          setPendingConfirm({
            title: '关闭确认',
            message: '有未保存的修改，确定要关闭吗？',
            onConfirm: () => { setPendingConfirm(null); onClose(); },
          });
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isEditing, hasChanges]);

  const handleFieldChange = useCallback((field: keyof NovelScheme, value: string) => {
    setEditedScheme(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  }, []);

  const handleSave = () => {
    onSave(editedScheme);
    setIsEditing(false);
    setHasChanges(false);
  };

  const handleCancelEdit = () => {
    if (hasChanges) {
      setPendingConfirm({
        title: '放弃修改',
        message: '放弃未保存的修改？',
        onConfirm: () => {
          setPendingConfirm(null);
          setEditedScheme({ ...scheme });
          setIsEditing(false);
          setHasChanges(false);
        },
      });
    } else {
      setEditedScheme({ ...scheme });
      setIsEditing(false);
    }
  };

  if (!scheme) return null;

  const displayScheme = isEditing ? editedScheme : scheme;

  const modalContent = (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" />

      <div
        className="relative w-full max-w-2xl max-h-[88vh] overflow-hidden rounded-2xl border shadow-2xl animate-fade-in-scale flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'linear-gradient(145deg, var(--color-surface-overlay) 0%, var(--color-surface-elevated) 100%)',
          borderColor: 'var(--color-border-default)',
        }}
      >
        {/* ═══ 顶部栏 ═══ */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0" style={{ borderColor: 'var(--color-border-default)' }}>
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold px-2.5 py-1 rounded-lg"
              style={{ color: 'var(--color-primary-400)', backgroundColor: 'var(--color-primary-100)' }}>
              方案 {index + 1}
            </span>
            {displayScheme.genre && (
              <span className="text-[10px] px-2 py-0.5 rounded"
                style={{ color: 'var(--color-text-secondary)', backgroundColor: 'var(--color-surface-muted)' }}>
                {displayScheme.genre}
              </span>
            )}
            {isEditing && hasChanges && (
              <span className="text-[10px] px-2 py-0.5 rounded-full animate-fade-in"
                style={{ color: 'var(--color-amber-400, #f59e0b)', backgroundColor: 'var(--color-amber-50, rgba(251,191,36,0.1))' }}>
                <i className="fas fa-circle text-[5px] mr-1" />
                已修改
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <button
                  onClick={handleCancelEdit}
                  className="px-3 py-1.5 rounded-lg text-xs transition-all"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  取消
                </button>
                <button
                  onClick={handleSave}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium transition-all text-white"
                  style={{
                    background: hasChanges
                      ? 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))'
                      : 'var(--color-surface-muted)',
                    color: hasChanges ? 'white' : 'var(--color-text-tertiary)',
                  }}
                >
                  <i className="fas fa-save mr-1.5" />保存
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                className="px-4 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  backgroundColor: 'var(--color-primary-100)',
                  color: 'var(--color-primary-400)',
                  border: '1px solid var(--color-primary-200)',
                }}
              >
                <i className="fas fa-edit mr-1.5" />编辑
              </button>
            )}
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--color-surface-hover)]"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              <i className="fas fa-times" />
            </button>
          </div>
        </div>

        {/* ═══ 内容区域 ═══ */}
        <div className="overflow-y-auto px-5 py-5 space-y-5 flex-1">
          {/* 书名 */}
          <div>
            <label className="text-[10px] uppercase tracking-wider font-bold mb-1.5 flex items-center gap-1.5" style={{ color: 'var(--color-text-tertiary)' }}>
              <i className="fas fa-book text-[9px]" style={{ color: 'var(--color-primary-400)' }} />
              书名
            </label>
            {isEditing ? (
              <div className="relative">
                <input
                  type="text"
                  value={editedScheme.title}
                  onChange={(e) => handleFieldChange('title', e.target.value)}
                  className="w-full text-xl font-black bg-transparent rounded-lg outline-none px-3 py-2 transition-all"
                  style={{
                    color: 'var(--color-text-primary)',
                    border: '2px solid var(--color-primary-200)',
                    backgroundColor: 'var(--color-surface-muted)',
                  }}
                  placeholder="输入书名..."
                />
                <span className="absolute right-3 bottom-2 text-[9px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  {editedScheme.title.length}/50
                </span>
              </div>
            ) : (
              <h2 className="text-2xl font-black" style={{ color: 'var(--color-text-primary)' }}>
                {scheme.title}
              </h2>
            )}
          </div>

          {/* 类型 & 基调 — 并排 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] uppercase tracking-wider font-bold mb-1.5 block" style={{ color: 'var(--color-text-tertiary)' }}>
                类型
              </label>
              {isEditing ? (
                <input
                  type="text"
                  value={editedScheme.genre || ''}
                  onChange={(e) => handleFieldChange('genre', e.target.value)}
                  className="w-full text-sm bg-transparent rounded-lg outline-none px-3 py-2 transition-all"
                  style={{
                    color: 'var(--color-text-secondary)',
                    border: '2px solid var(--color-primary-200)',
                    backgroundColor: 'var(--color-surface-muted)',
                  }}
                  placeholder="如：玄幻、科幻..."
                />
              ) : (
                <p className="text-sm px-3 py-2 rounded-lg" style={{ color: 'var(--color-text-secondary)', backgroundColor: 'var(--color-surface-muted)' }}>
                  {scheme.genre || '未设定'}
                </p>
              )}
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-bold mb-1.5 block" style={{ color: 'var(--color-text-tertiary)' }}>
                基调
              </label>
              {isEditing ? (
                <input
                  type="text"
                  value={editedScheme.tone || ''}
                  onChange={(e) => handleFieldChange('tone', e.target.value)}
                  className="w-full text-sm bg-transparent rounded-lg outline-none px-3 py-2 transition-all"
                  style={{
                    color: 'var(--color-primary-300)',
                    border: '2px solid var(--color-primary-200)',
                    backgroundColor: 'var(--color-surface-muted)',
                  }}
                  placeholder="如：热血、悬疑..."
                />
              ) : (
                <p className="text-sm px-3 py-2 rounded-lg" style={{ color: 'var(--color-primary-300)', backgroundColor: 'var(--color-surface-muted)' }}>
                  {scheme.tone || '未设定'}
                </p>
              )}
            </div>
          </div>

          {/* 简介 */}
          <div>
            <label className="text-[10px] uppercase tracking-wider font-bold mb-1.5 block" style={{ color: 'var(--color-text-tertiary)' }}>
              简介
            </label>
            {isEditing ? (
              <div className="relative">
                <textarea
                  value={editedScheme.intro}
                  onChange={(e) => handleFieldChange('intro', e.target.value)}
                  rows={5}
                  className="w-full text-sm bg-transparent rounded-lg outline-none px-3 py-2 resize-none transition-all leading-relaxed"
                  style={{
                    color: 'var(--color-text-secondary)',
                    border: '2px solid var(--color-primary-200)',
                    backgroundColor: 'var(--color-surface-muted)',
                  }}
                  placeholder="输入方案简介..."
                />
                <span className="absolute right-3 bottom-2 text-[9px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  {editedScheme.intro.length} 字
                </span>
              </div>
            ) : (
              <p className="text-sm leading-relaxed px-3 py-2 rounded-lg" style={{ color: 'var(--color-text-secondary)', backgroundColor: 'var(--color-surface-muted)' }}>
                {scheme.intro}
              </p>
            )}
          </div>

          {/* 核心冲突 */}
          <div>
            <label className="text-[10px] uppercase tracking-wider font-bold mb-1.5 block" style={{ color: 'var(--color-text-tertiary)' }}>
              ⚡ 核心冲突
            </label>
            {isEditing ? (
              <div className="relative">
                <textarea
                  value={editedScheme.coreConflict || ''}
                  onChange={(e) => handleFieldChange('coreConflict', e.target.value)}
                  rows={3}
                  className="w-full text-xs bg-transparent rounded-lg outline-none px-3 py-2 resize-none transition-all leading-relaxed"
                  style={{
                    color: 'var(--color-text-tertiary)',
                    border: '2px solid var(--color-primary-200)',
                    backgroundColor: 'var(--color-surface-muted)',
                  }}
                  placeholder="描述核心冲突..."
                />
                <span className="absolute right-3 bottom-2 text-[9px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  {(editedScheme.coreConflict || '').length} 字
                </span>
              </div>
            ) : (
              <p className="text-xs leading-relaxed px-3 py-2 rounded-lg" style={{ color: 'var(--color-text-tertiary)', backgroundColor: 'var(--color-surface-muted)' }}>
                {scheme.coreConflict || '暂无'}
              </p>
            )}
          </div>

          {/* 亮点 */}
          <div>
            <label className="text-[10px] uppercase tracking-wider font-bold mb-1.5 block" style={{ color: 'var(--color-text-tertiary)' }}>
              ✨ 亮点
            </label>
            {isEditing ? (
              <div className="relative">
                <textarea
                  value={editedScheme.highlights || ''}
                  onChange={(e) => handleFieldChange('highlights', e.target.value)}
                  rows={3}
                  className="w-full text-xs bg-transparent rounded-lg outline-none px-3 py-2 resize-none transition-all leading-relaxed"
                  style={{
                    color: 'var(--color-text-tertiary)',
                    border: '2px solid var(--color-primary-200)',
                    backgroundColor: 'var(--color-surface-muted)',
                  }}
                  placeholder="描述方案亮点..."
                />
                <span className="absolute right-3 bottom-2 text-[9px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  {(editedScheme.highlights || '').length} 字
                </span>
              </div>
            ) : (
              <p className="text-xs leading-relaxed px-3 py-2 rounded-lg" style={{ color: 'var(--color-text-tertiary)', backgroundColor: 'var(--color-surface-muted)' }}>
                {scheme.highlights || '暂无'}
              </p>
            )}
          </div>
        </div>

        {/* ═══ 底部状态栏 ═══ */}
        <div className="flex items-center justify-between px-5 py-3 border-t shrink-0" style={{ borderColor: 'var(--color-border-default)' }}>
          <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
            {isEditing ? (
              <><i className="fas fa-pen text-[9px] mr-1" />编辑模式 — 修改后点击上方保存</>
            ) : (
              <><i className="fas fa-info-circle text-[9px] mr-1" />预览模式 — 点击上方编辑</>
            )}
          </span>
          <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>按 Esc 关闭</span>
        </div>
      </div>

      {pendingConfirm && (
        <ConfirmModal
          title={pendingConfirm.title}
          message={pendingConfirm.message}
          variant="warning"
          confirmText="确认"
          onConfirm={pendingConfirm.onConfirm}
          onCancel={() => setPendingConfirm(null)}
        />
      )}
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default SchemePreviewModal;
