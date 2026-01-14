import React from 'react';
import { DeckButtonConfig } from '../types';
import { Icon } from './Icon';
import { cn } from '../utils/cn';

interface DeckButtonProps {
  config: DeckButtonConfig;
  onClick: (id: string) => void;
  onEdit: (config: DeckButtonConfig) => void;
  isEditMode: boolean;
}

export const DeckButton: React.FC<DeckButtonProps> = ({ config, onClick, onEdit, isEditMode }) => {
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onEdit(config);
  };

  return (
    <button
      onClick={() => isEditMode ? onEdit(config) : onClick(config.id)}
      onContextMenu={handleContextMenu}
      className={cn(
        "relative flex flex-col items-center justify-center h-32 w-full rounded-2xl shadow-lg transition-all active:scale-95 group overflow-hidden border border-white/5",
        config.color,
        isEditMode && "ring-2 ring-white/50 animate-pulse cursor-context-menu"
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-black/10 pointer-events-none" />
      
      {/* Icon */}
      <Icon 
        name={config.iconName} 
        className="w-10 h-10 text-white mb-2 drop-shadow-md z-10 transition-transform group-hover:scale-110" 
      />
      
      {/* Label */}
      <span className="text-white font-bold text-sm uppercase tracking-wide drop-shadow-md z-10 px-2 text-center break-words w-full truncate">
        {config.label}
      </span>

      {/* Edit Indicator */}
      {isEditMode && (
        <div className="absolute top-2 right-2 bg-black/50 rounded-full p-1 backdrop-blur-sm">
          <Icon name="edit" className="w-3 h-3 text-white" />
        </div>
      )}
    </button>
  );
};