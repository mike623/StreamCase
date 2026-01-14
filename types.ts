export interface DeckButtonConfig {
  id: string;
  label: string;
  iconName: string;
  color: string; // Tailwind bg class
  payload: string; // JSON string or simple text
}

export interface BroadcastMessage {
  type: 'BUTTON_PRESS';
  buttonId: string;
  payload: any;
  timestamp: number;
}

export enum AppMode {
  CONTROLLER = 'CONTROLLER',
  RECEIVER = 'RECEIVER',
}

export const DEFAULT_BUTTONS: DeckButtonConfig[] = [
  { id: '1', label: 'Scene 1', iconName: 'monitor', color: 'bg-blue-600', payload: '{"action": "scene", "id": 1}' },
  { id: '2', label: 'Mute Mic', iconName: 'mic-off', color: 'bg-red-600', payload: '{"action": "mute"}' },
  { id: '3', label: 'Camera', iconName: 'camera', color: 'bg-emerald-600', payload: '{"action": "camera_toggle"}' },
  { id: '4', label: 'Chat', iconName: 'message-square', color: 'bg-purple-600', payload: '{"action": "chat_overlay"}' },
  { id: '5', label: 'BRB', iconName: 'clock', color: 'bg-amber-600', payload: '{"action": "scene", "id": "brb"}' },
  { id: '6', label: 'Ending', iconName: 'power', color: 'bg-rose-600', payload: '{"action": "stop_stream"}' },
];