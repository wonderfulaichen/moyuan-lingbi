import React from 'react';
import { CHANGELOG } from '../../shared/data/changelog';

interface MobileWelcomeProps {
  onCreateProject: () => void;
}

const AUTHOR_INFO = '笔编辑图标 by Max Gedrovich on Icon-Icons.com';

const MobileWelcome: React.FC<MobileWelcomeProps> = ({ onCreateProject }) => {
  const latestUpdate = CHANGELOG[0];

  return (
    <div className="mobile-welcome">
      <div className="mobile-welcome-content">
        {/* Logo */}
        <div className="mobile-welcome-logo">
          <div className="mobile-logo-icon">
            <i className="fas fa-pen-fancy"></i>
          </div>
        </div>

        {/* 标题 */}
        <div className="mobile-welcome-text">
          <h1 className="mobile-welcome-title">墨渊灵笔</h1>
          <p className="mobile-welcome-subtitle">AI小说创作工坊</p>
        </div>

        {/* 最新更新 */}
        {latestUpdate && (
          <div className="mobile-latest-update">
            <div className="update-header">
              <i className="fas fa-rocket"></i>
              <span>最新更新 v{latestUpdate.version}</span>
            </div>
            <p className="update-title">{latestUpdate.title}</p>
            <p className="update-date">{latestUpdate.date}</p>
          </div>
        )}

        {/* 特色介绍 */}
        <div className="mobile-features">
          <div className="mobile-feature-item">
            <div className="mobile-feature-icon">
              <i className="fas fa-lightbulb"></i>
            </div>
            <span>灵感萌发</span>
          </div>
          <div className="mobile-feature-item">
            <div className="mobile-feature-icon">
              <i className="fas fa-folder-tree"></i>
            </div>
            <span>内容设定</span>
          </div>
          <div className="mobile-feature-item">
            <div className="mobile-feature-icon">
              <i className="fas fa-pen-nib"></i>
            </div>
            <span>情节创作</span>
          </div>
          <div className="mobile-feature-item">
            <div className="mobile-feature-icon">
              <i className="fas fa-brain"></i>
            </div>
            <span>智能审查</span>
          </div>
        </div>

        {/* 创建按钮 */}
        <button onClick={onCreateProject} className="mobile-create-btn">
          <i className="fas fa-plus"></i>
          <span>创建新作品</span>
        </button>

        {/* 署名信息 */}
        <div className="mobile-credit">
          <i className="fas fa-pencil-alt"></i>
          <span>{AUTHOR_INFO}</span>
        </div>

        {/* 提示文字 */}
        <p className="mobile-welcome-hint">从下方导航选择创作步骤</p>
      </div>
    </div>
  );
};

export default MobileWelcome;
