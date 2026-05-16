import React from 'react';

interface MobileContentPanelProps {
  children: React.ReactNode;
  className?: string;
}

const MobileContentPanel: React.FC<MobileContentPanelProps> = ({
  children,
  className = '',
}) => {
  return (
    <div className={`mobile-content-panel ${className}`}>
      {children}
    </div>
  );
};

export default MobileContentPanel;
