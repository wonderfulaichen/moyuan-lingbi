/**
 * FileViewer — 文件预览组件
 *
 * 根据 fileId 从 dataService 读取文件内容并展示
 */
import React, { useState, useEffect } from 'react';
import { dataService } from '../../shared/services/DataService';

interface FileViewerProps {
  fileId: string | null;
}

const FileViewer: React.FC<FileViewerProps> = ({ fileId }) => {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const unsub = dataService.subscribe(() => setVersion(v => v + 1));
    return unsub;
  }, []);

  if (!fileId) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>选择一个文件查看内容</p>
      </div>
    );
  }

  const fs = dataService.getFS();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const file = fs?.files[fileId];

  if (!file) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>文件未找到</p>
      </div>
    );
  }

  const isFolder = file.type === 'folder';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--color-background-primary)' }}>
      {/* 文件头 */}
      <div style={{ padding: '8px 14px', borderBottom: '0.5px solid var(--color-border-tertiary)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
          {isFolder ? (
            <><path d="M2 4H14V13H2V4Z" fill="none" stroke="#534AB7" strokeWidth="1.2"/><path d="M2 4L8 6L14 4" stroke="#534AB7" strokeWidth="1.2"/></>
          ) : (
            <path d="M4 2H10L12 4V14H4V2Z" stroke="#534AB7" strokeWidth="1"/>
          )}
        </svg>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>{file.name}</span>
        <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>
          {isFolder ? '文件夹' : `${file.version} 版 · ${new Date(file.updatedAt).toLocaleString()}`}
        </span>
        {file.metadata.aiGenerated && (
          <span style={{ fontSize: 8, padding: '1px 5px', background: '#EEEDFE', color: '#534AB7', borderRadius: 2 }}>AI 生成</span>
        )}
      </div>

      {/* 预览内容 */}
      <div style={{ flex: 1, overflow: 'auto', padding: 14 }}>
        {isFolder ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {file.childrenIds.length === 0 ? (
              <p style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>空文件夹</p>
            ) : file.childrenIds.map(childId => {
              const child = fs?.files[childId];
              if (!child) return null;
              return (
                <div key={childId} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 4, border: '0.5px solid var(--color-border-tertiary)' }}>
                  <svg width="8" height="8" viewBox="0 0 16 16" fill="none">
                    {child.type === 'folder' ? (
                      <><path d="M2 4H14V13H2V4Z" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="1"/><path d="M2 4L8 6L14 4" stroke="var(--color-text-tertiary)" strokeWidth="1"/></>
                    ) : (
                      <path d="M4 2H10L12 4V14H4V2Z" stroke="var(--color-text-tertiary)" strokeWidth="1"/>
                    )}
                  </svg>
                  <span style={{ fontSize: 10, color: 'var(--color-text-primary)' }}>{child.name}</span>
                  <span style={{ fontSize: 8, color: 'var(--color-text-tertiary)' }}>{child.content.length} 字</span>
                </div>
              );
            })}
          </div>
        ) : (
          <pre style={{ fontSize: 10, color: 'var(--color-text-primary)', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
            {file.content || '(空文件)'}
          </pre>
        )}
      </div>
    </div>
  );
};

export default FileViewer;
