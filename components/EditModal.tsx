import React, { useState, useEffect } from 'react';
import { DeckButtonConfig } from '../types';
import { Dialog, Button, Input, Label, Select } from './ui';
import { IconMap, Icon } from './Icon';
import { generateButtonConfig } from '../services/gemini';

interface EditModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (config: DeckButtonConfig) => void;
  onDelete: (id: string) => void;
  initialConfig: DeckButtonConfig | null;
}

const COLORS = [
  { label: 'Blue', value: 'bg-blue-600' },
  { label: 'Red', value: 'bg-red-600' },
  { label: 'Green', value: 'bg-emerald-600' },
  { label: 'Purple', value: 'bg-purple-600' },
  { label: 'Amber', value: 'bg-amber-600' },
  { label: 'Pink', value: 'bg-pink-600' },
  { label: 'Gray', value: 'bg-zinc-700' },
  { label: 'Black', value: 'bg-black' },
];

export const EditModal: React.FC<EditModalProps> = ({ open, onClose, onSave, onDelete, initialConfig }) => {
  const [config, setConfig] = useState<DeckButtonConfig>({
    id: '',
    label: '',
    iconName: 'command',
    color: 'bg-blue-600',
    payload: '{}'
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [prompt, setPrompt] = useState('');

  useEffect(() => {
    if (initialConfig) {
      setConfig(initialConfig);
    } else {
      // Reset for new button
      setConfig({
        id: crypto.randomUUID(),
        label: 'New Button',
        iconName: 'command',
        color: 'bg-blue-600',
        payload: '{}'
      });
    }
  }, [initialConfig, open]);

  const handleMagicGenerate = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    try {
      const generated = await generateButtonConfig(prompt);
      setConfig(prev => ({
        ...prev,
        label: generated.label || prev.label,
        iconName: generated.iconName || prev.iconName,
        color: generated.color || prev.color,
        payload: generated.payload || prev.payload,
      }));
    } catch (e) {
      console.error(e);
      alert('Failed to generate button. Check API Key.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">{initialConfig ? 'Edit Button' : 'Create Button'}</h2>
          {initialConfig && (
            <Button variant="destructive" size="sm" onClick={() => onDelete(config.id)}>
              <Icon name="trash" className="w-4 h-4 mr-2" /> Delete
            </Button>
          )}
        </div>

        {/* AI Generator Section */}
        <div className="p-4 bg-muted/50 rounded-lg border border-border space-y-3">
          <Label className="flex items-center gap-2 text-blue-400">
             <Icon name="sparkles" className="w-4 h-4" /> 
             Magic Generate
          </Label>
          <div className="flex gap-2">
            <Input 
              placeholder="e.g. 'Emergency Stop red button'" 
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <Button 
              disabled={isGenerating || !prompt} 
              onClick={handleMagicGenerate}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isGenerating ? 'Thinking...' : 'Go'}
            </Button>
          </div>
        </div>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="label" className="text-right">Label</Label>
            <Input id="label" value={config.label} onChange={e => setConfig({...config, label: e.target.value})} className="col-span-3" />
          </div>
          
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="icon" className="text-right">Icon</Label>
            <Select id="icon" value={config.iconName} onChange={e => setConfig({...config, iconName: e.target.value})} className="col-span-3">
              {Object.keys(IconMap).map(icon => (
                <option key={icon} value={icon}>{icon}</option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="color" className="text-right">Color</Label>
            <Select id="color" value={config.color} onChange={e => setConfig({...config, color: e.target.value})} className="col-span-3">
              {COLORS.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="payload" className="text-right">Payload</Label>
            <Input id="payload" value={config.payload} onChange={e => setConfig({...config, payload: e.target.value})} className="col-span-3 font-mono text-xs" />
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(config)}>Save Changes</Button>
        </div>
      </div>
    </Dialog>
  );
};