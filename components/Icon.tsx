import React from 'react';
import { 
  Monitor, Mic, MicOff, Camera, MessageSquare, Clock, Power, 
  Settings, Zap, Wifi, Radio, Command, Edit, Plus, Trash2, 
  Sparkles, Check, X, Smartphone, Activity, Volume2, Video
} from 'lucide-react';

export const IconMap: Record<string, React.ElementType> = {
  monitor: Monitor,
  mic: Mic,
  'mic-off': MicOff,
  camera: Camera,
  'message-square': MessageSquare,
  clock: Clock,
  power: Power,
  settings: Settings,
  zap: Zap,
  wifi: Wifi,
  radio: Radio,
  command: Command,
  edit: Edit,
  plus: Plus,
  trash: Trash2,
  sparkles: Sparkles,
  check: Check,
  x: X,
  smartphone: Smartphone,
  activity: Activity,
  volume: Volume2,
  video: Video
};

interface IconProps extends React.SVGProps<SVGSVGElement> {
  name: string;
}

export const Icon: React.FC<IconProps> = ({ name, className, ...props }) => {
  const IconComponent = IconMap[name] || Command;
  return <IconComponent className={className} {...props} />;
};