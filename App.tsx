import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BroadcastMessage, DeckButtonConfig, DEFAULT_BUTTONS } from './types';
import { cn } from './utils/cn';
import { DeckButton } from './components/DeckButton';
import { EditModal } from './components/EditModal';
import { Button, Card, CardContent, CardHeader, Input, Label } from './components/ui';
import { Icon } from './components/Icon';
import { Peer, DataConnection } from 'peerjs';

const App = () => {
  const [buttons, setButtons] = useState<DeckButtonConfig[]>(DEFAULT_BUTTONS);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingButton, setEditingButton] = useState<DeckButtonConfig | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [logs, setLogs] = useState<BroadcastMessage[]>([]);
  const [lastBroadcast, setLastBroadcast] = useState<string | null>(null);
  
  // P2P State
  const [roomId, setRoomId] = useState<string>(() => {
    return new URLSearchParams(window.location.search).get('room') || 'default-room';
  });
  const [peerId, setPeerId] = useState<string>('');
  const [connections, setConnections] = useState<DataConnection[]>([]);
  const [isPeerReady, setIsPeerReady] = useState(false);
  
  const peerRef = useRef<Peer | null>(null);

  // Persistence
  useEffect(() => {
    const saved = localStorage.getItem('streamcast_buttons');
    if (saved) {
      try { setButtons(JSON.parse(saved)); } catch (e) {}
    }
  }, []);

  // PeerJS Connection Logic
  useEffect(() => {
    // Generate a unique ID for this device within the room
    const myId = `${roomId}-${Math.random().toString(36).substr(2, 6)}`;
    const peer = new Peer(myId);
    peerRef.current = peer;

    peer.on('open', (id) => {
      setPeerId(id);
      setIsPeerReady(true);
      console.log('My peer ID is: ' + id);
      
      // Broadly attempt to connect to anyone else in the room
      // Since we don't have a list of active peers, PeerJS works best if 
      // one person is the "host" or we use a signaling server. 
      // For a "no-server" feel, we rely on the peer list if supported or manual entry.
      // In this version, we listen for connections.
    });

    peer.on('connection', (conn) => {
      setupConnection(conn);
    });

    peer.on('error', (err) => {
      console.error('Peer error:', err);
      if (err.type === 'peer-unavailable') {
        // Handle gracefully
      }
    });

    return () => {
      peer.destroy();
    };
  }, [roomId]);

  const setupConnection = (conn: DataConnection) => {
    conn.on('open', () => {
      setConnections(prev => {
        if (prev.find(c => c.peer === conn.peer)) return prev;
        return [...prev, conn];
      });
      console.log('Connected to:', conn.peer);
    });

    conn.on('data', (data) => {
      const msg = data as BroadcastMessage;
      setLogs(prev => [msg, ...prev].slice(0, 50));
    });

    conn.on('close', () => {
      setConnections(prev => prev.filter(c => c.peer !== conn.peer));
    });
  };

  const connectToPeer = (targetId: string) => {
    if (!peerRef.current || targetId === peerId) return;
    const conn = peerRef.current.connect(targetId);
    setupConnection(conn);
  };

  // UI Handlers
  const handleBroadcast = (id: string) => {
    const btn = buttons.find(b => b.id === id);
    if (!btn) return;

    setLastBroadcast(id);
    setTimeout(() => setLastBroadcast(null), 500);

    const message: BroadcastMessage = {
      type: 'BUTTON_PRESS',
      buttonId: id,
      payload: btn.payload,
      timestamp: Date.now()
    };

    // Log locally
    setLogs(prev => [message, ...prev].slice(0, 50));

    // Send to all connected peers
    connections.forEach(conn => {
      if (conn.open) {
        conn.send(message);
      }
    });
  };

  const saveButtons = (newButtons: DeckButtonConfig[]) => {
    setButtons(newButtons);
    localStorage.setItem('streamcast_buttons', JSON.stringify(newButtons));
  };

  const copyRoomLink = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('room', roomId);
    navigator.clipboard.writeText(url.toString());
    alert('Room link copied! Open this on your other phone.');
  };

  const handleJoinRoom = () => {
    const newRoom = prompt('Enter Room ID:', roomId);
    if (newRoom && newRoom !== roomId) {
      window.location.search = `?room=${newRoom}`;
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-5xl mx-auto pb-10">
      {/* Header */}
      <header className="border-b border-border sticky top-0 bg-background/80 backdrop-blur-md z-40">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="bg-primary p-2 rounded-lg">
              <Icon name="radio" className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight">StreamCast</h1>
              <div className="flex items-center gap-2">
                <span className={cn("w-2 h-2 rounded-full", isPeerReady ? "bg-emerald-500" : "bg-red-500 animate-pulse")} />
                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">
                  Room: {roomId}
                </span>
              </div>
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={copyRoomLink}>
              <Icon name="wifi" className="w-4 h-4 mr-2" /> Invite
            </Button>
            <Button variant="ghost" size="sm" onClick={handleJoinRoom}>
              <Icon name="settings" className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Connection Drawer */}
      <div className="px-4 py-2 border-b border-border bg-muted/20 flex items-center justify-between overflow-x-auto whitespace-nowrap gap-4">
        <span className="text-xs text-muted-foreground">Connected Devices: {connections.length}</span>
        <div className="flex gap-2 items-center">
            {/* Manual Peer Connect for edge cases */}
            <Input 
                placeholder="Target Peer ID..." 
                className="h-7 text-[10px] w-32"
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        connectToPeer((e.target as HTMLInputElement).value);
                        (e.target as HTMLInputElement).value = '';
                    }
                }}
            />
            <span className="text-[9px] text-muted-foreground opacity-50">ID: {peerId.split('-').pop()}</span>
        </div>
      </div>

      <main className="flex-1 p-4 md:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* DECK SECTION */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Control Surface</h2>
            <div className="flex gap-2">
              <Button 
                variant={isEditMode ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setIsEditMode(!isEditMode)}
                className={cn(isEditMode && "text-amber-400 bg-amber-400/10")}
              >
                {isEditMode ? 'Finish' : 'Edit'}
              </Button>
              {isEditMode && (
                <Button size="sm" onClick={() => setIsModalOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  <Icon name="plus" className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {buttons.map(btn => (
              <div key={btn.id} className={cn("transition-transform duration-100", lastBroadcast === btn.id && "scale-95 brightness-125")}>
                  <DeckButton 
                      config={btn} 
                      onClick={handleBroadcast} 
                      onEdit={(cfg) => {
                          setEditingButton(cfg);
                          setIsModalOpen(true);
                      }}
                      isEditMode={isEditMode}
                  />
              </div>
            ))}
          </div>
        </div>

        {/* LOGS SECTION */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Live Broadcasts</h2>
          <Card className="bg-black/40 border-border">
            <CardContent className="p-0 h-[400px] overflow-y-auto font-mono scroll-smooth">
              {logs.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground opacity-30 p-8 text-center">
                  <Icon name="activity" className="w-12 h-12 mb-2" />
                  <p className="text-xs">No activity detected on this room yet.</p>
                </div>
              )}
              <div className="divide-y divide-border">
                {logs.map((log, i) => (
                  <div key={i} className="p-3 bg-white/[0.02] hover:bg-white/[0.05] transition-colors">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] font-bold text-primary">{log.buttonId}</span>
                      <span className="text-[9px] text-muted-foreground">
                        {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                    <div className="text-[11px] text-emerald-400/90 truncate">
                      {typeof log.payload === 'string' ? log.payload : JSON.stringify(log.payload)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      <EditModal 
        open={isModalOpen} 
        onClose={() => {
            setIsModalOpen(false);
            setEditingButton(null);
        }}
        onSave={(config) => {
            if (editingButton) saveButtons(buttons.map(b => b.id === config.id ? config : b));
            else saveButtons([...buttons, config]);
            setIsModalOpen(false);
            setEditingButton(null);
        }}
        onDelete={(id) => {
            saveButtons(buttons.filter(b => b.id !== id));
            setIsModalOpen(false);
            setEditingButton(null);
        }}
        initialConfig={editingButton}
      />
    </div>
  );
};

export default App;