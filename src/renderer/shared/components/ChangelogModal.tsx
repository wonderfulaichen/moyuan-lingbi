import React, { useState } from 'react';
import { CHANGELOG, ChangelogEntry, markChangelogSeen } from '../data/changelog';

interface ChangelogModalProps {
  onClose: () => void;
  autoShow?: boolean;
}

const TYPE_STYLES: Record<ChangelogEntry['items'][0]['type'], { label: string; bg: string; text: string }> = {
  feature: { label: '新增', bg: 'bg-emerald-900/30', text: 'text-emerald-300' },
  fix: { label: '修复', bg: 'bg-red-900/30', text: 'text-red-300' },
  improvement: { label: '优化', bg: 'bg-blue-900/30', text: 'text-blue-300' },
  ui: { label: 'UI', bg: 'bg-[var(--color-primary-100)]', text: 'text-[var(--color-primary-300)]' },
};

const ChangelogModal: React.FC<ChangelogModalProps> = ({ onClose, autoShow }) => {
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = () => {
    setIsClosing(true);
    markChangelogSeen();
    setTimeout(() => onClose(), 200);
  };

  return (
    <div
      className={`fixed inset-0 z-[10002] flex items-center justify-center p-4 sm:p-6 transition-opacity duration-200 ${
        isClosing ? 'opacity-0' : 'opacity-100'
      }`}
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      onClick={handleClose}
    >
      <div
        className={`relative w-full max-w-lg max-h-[80vh] overflow-hidden rounded-2xl shadow-2xl border border-[var(--color-border-default)] backdrop-blur-xl flex flex-col ${
          isClosing ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
        } transition-all duration-200`}
        style={{ backgroundColor: 'var(--color-surface-overlay, rgba(10,10,20,0.95))' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border-subtle)] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-600/30 to-orange-600/20 flex items-center justify-center border border-amber-500/20">
              <i className="fas fa-scroll text-amber-400 text-sm"></i>
            </div>
            <div>
              <h3 className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>
                更新日志
              </h3>
              <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                了解墨渊灵笔的最新变更
              </p>
            </div>
          </div>
          <button onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
            style={{ color: 'var(--color-text-muted)' }}>
            <i className="fas fa-xmark text-sm"></i>
          </button>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {CHANGELOG.map((entry, ei) => (
            <div key={entry.version}>
              {/* 版本标题 */}
              <div className="flex items-center gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold tracking-wide"
                    style={{ background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))', color: '#ffffff' }}>
                    v{entry.version}
                  </span>
                  <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{entry.date}</span>
                </div>
                {ei === 0 && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-900/30 text-amber-300 border border-amber-700/30">
                    最新
                  </span>
                )}
              </div>

              {/* 版本标题 */}
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                {entry.title}
              </p>

              {/* 条目列表 */}
              <div className="space-y-1.5">
                {entry.items.map((item, ii) => {
                  const style = TYPE_STYLES[item.type];
                  return (
                    <div key={ii} className="flex items-start gap-2">
                      <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded ${style.bg} ${style.text} font-medium`}>
                        {style.label}
                      </span>
                      <span className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                        {item.text}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* 分隔线 */}
              {ei < CHANGELOG.length - 1 && (
                <div className="mt-4 border-t border-[var(--color-border-subtle)]"></div>
              )}
            </div>
          ))}
        </div>

        {/* 底部 */}
        <div className="px-5 py-3 border-t border-[var(--color-border-subtle)] shrink-0 flex items-center justify-between">
          <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
            {autoShow ? '🎉 检测到新版本更新' : ''}
          </span>
          <button onClick={handleClose}
            className="px-4 py-1.5 text-xs font-medium text-white rounded-lg transition-all"
            style={{ background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))' }}>
            知道了
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChangelogModal;
