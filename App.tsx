import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BroadcastMessage, DeckButtonConfig, DEFAULT_BUTTONS } from './types';
import { cn } from './utils/cn';
import { DeckButton } from './components/DeckButton';
import { EditModal } from './components/EditModal';
import { Button, Card, CardContent, CardHeader, Input, Label, Dialog } from './components/ui';
import { Icon } from './components/Icon';
import { Peer, DataConnection } from 'peerjs';
import QRCode from 'qrcode';
import { Html5QrcodeScanner } from 'html5-qrcode';

const App = () => {
  const [buttons, setButtons] = useState<DeckButtonConfig[]>(DEFAULT_BUTTONS);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingButton, setEditingButton] = useState<DeckButtonConfig | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [logs, setLogs] = useState<BroadcastMessage[]>([]);
  const [lastBroadcast, setLastBroadcast] = useState<string | null>(null);
  
  // P2P State
  const [peerId, setPeerId] = useState<string>('');
  const [connections, setConnections] = useState<DataConnection[]>([]);
  const [isPeerReady, setIsPeerReady] = useState(false);
  
  // Modals
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isScannerActive, setIsScannerActive] = useState(false);
  
  const peerRef = useRef<Peer | null>(null);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('streamcast_buttons');
    if (saved) {
      try { setButtons(JSON.parse(saved)); } catch (e) {}
    }
  }, []);

  // Initialize PeerJS
  useEffect(() => {
    const peer = new Peer();
    peerRef.current = peer;

    peer.on('open', (id) => {
      setPeerId(id);
      setIsPeerReady(true);
      // Generate QR for this Peer ID
      QRCode.toDataURL(id, { width: 300, margin: 2 }).then(setQrDataUrl);
    });

    peer.on('connection', (conn) => {
      setupConnection(conn);
    });

    return () => {
      peer.destroy();
    };
  }, []);

  const setupConnection = (conn: DataConnection) => {
    conn.on('open', () => {
      setConnections(prev => {
        if (prev.find(c => c.peer === conn.peer)) return prev;
        return [...prev, conn];
      });
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
    setIsConnectModalOpen(false);
  };

  // QR Scanner Logic
  useEffect(() => {
    if (isScannerActive && !scannerRef.current) {
      const scanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: 250 }, false);
      scanner.render((decodedText) => {
        connectToPeer(decodedText);
        stopScanner();
      }, (err) => {});
      scannerRef.current = scanner;
    }
    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(e => console.error(e));
        scannerRef.current = null;
      }
    };
  }, [isScannerActive]);

  const stopScanner = () => {
    setIsScannerActive(false);
    if (scannerRef.current) {
      scannerRef.current.clear().catch(e => console.error(e));
      scannerRef.current = null;
    }
  };

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

    setLogs(prev => [message, ...prev].slice(0, 50));
    connections.forEach(conn => conn.open && conn.send(message));
  };

  const saveButtons = (newButtons: DeckButtonConfig[]) => {
    setButtons(newButtons);
    localStorage.setItem('streamcast_buttons', JSON.stringify(newButtons));
  };

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-5xl mx-auto pb-10">
      <header className="border-b border-border sticky top-0 bg-background/80 backdrop-blur-md z-40">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="bg-primary p-2 rounded-lg">
              <Icon name="radio" className="text-white w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-base leading-tight">StreamCast</h1>
              <div className="flex items-center gap-2">
                <span className={cn("w-2 h-2 rounded-full", isPeerReady ? "bg-emerald-500" : "bg-red-500 animate-pulse")} />
                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">
                  {connections.length > 0 ? `${connections.length} Peer(s)` : 'Standby'}
                </span>
              </div>
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsConnectModalOpen(true)}>
              <Icon name="zap" className="w-4 h-4 mr-2" /> Connect
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setIsEditMode(!isEditMode)}>
              <Icon name={isEditMode ? "check" : "edit"} className={cn("w-4 h-4", isEditMode && "text-emerald-500")} />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Icon name="command" className="w-3 h-3" /> Control Surface
            </h2>
            {isEditMode && (
              <Button size="sm" variant="outline" onClick={() => setIsModalOpen(true)} className="h-7 text-[10px] uppercase font-bold">
                <Icon name="plus" className="w-3 h-3 mr-1" /> Add Button
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {buttons.map(btn => (
              <DeckButton 
                key={btn.id} 
                config={btn} 
                onClick={handleBroadcast} 
                onEdit={(cfg) => { setEditingButton(cfg); setIsModalOpen(true); }}
                isEditMode={isEditMode}
              />
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Icon name="activity" className="w-3 h-3" /> Event Log
          </h2>
          <Card className="bg-black/40 border-border">
            <CardContent className="p-0 h-[400px] overflow-y-auto font-mono text-[11px]">
              {logs.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground opacity-20 p-8 text-center">
                  <Icon name="radio" className="w-10 h-10 mb-2" />
                  <p>Awaiting P2P data...</p>
                </div>
              )}
              <div className="divide-y divide-border">
                {logs.map((log, i) => (
                  <div key={i} className="p-3 bg-white/[0.01] hover:bg-white/[0.03]">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-primary">{log.buttonId}</span>
                      <span className="opacity-40">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div className="text-emerald-400/80 truncate opacity-90">{typeof log.payload === 'string' ? log.payload : JSON.stringify(log.payload)}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Connect/QR Modal */}
      <Dialog open={isConnectModalOpen} onClose={() => { setIsConnectModalOpen(false); stopScanner(); }}>
        <div className="space-y-6 py-4">
          <div className="text-center space-y-2">
            <h2 className="text-xl font-bold">Pair Devices</h2>
            <p className="text-sm text-muted-foreground">Scan to connect directly via local network.</p>
          </div>

          <div className="flex flex-col items-center gap-4">
            {isScannerActive ? (
              <div className="w-full max-w-[300px] aspect-square bg-black rounded-xl overflow-hidden relative border-2 border-primary">
                <div id="reader" className="w-full h-full"></div>
                <Button variant="destructive" size="sm" className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10" onClick={stopScanner}>
                  Cancel Scan
                </Button>
              </div>
            ) : (
              <div className="space-y-4 flex flex-col items-center">
                {qrDataUrl && (
                  <div className="bg-white p-4 rounded-xl shadow-xl">
                    <img src={qrDataUrl} alt="Pairing QR" className="w-48 h-48" />
                  </div>
                )}
                <div className="text-center">
                  <p className="text-[10px] font-mono opacity-50 mb-2">My ID: {peerId}</p>
                  <Button onClick={() => setIsScannerActive(true)} className="w-full">
                    <Icon name="camera" className="w-4 h-4 mr-2" /> Scan Someone Else
                  </Button>
                </div>
              </div>
            )}
          </div>
          
          <div className="border-t border-border pt-4">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground block mb-2">Manual Entry</Label>
            <div className="flex gap-2">
              <Input 
                placeholder="Paste Peer ID..." 
                className="font-mono text-xs"
                onKeyDown={(e) => e.key === 'Enter' && connectToPeer((e.target as HTMLInputElement).value)}
              />
            </div>
          </div>
        </div>
      </Dialog>

      <EditModal 
        open={isModalOpen} 
        onClose={() => { setIsModalOpen(false); setEditingButton(null); }}
        onSave={(config) => {
            if (editingButton) saveButtons(buttons.map(b => b.id === config.id ? config : b));
            else saveButtons([...buttons, config]);
            setIsModalOpen(false); setEditingButton(null);
        }}
        onDelete={(id) => {
            saveButtons(buttons.filter(b => b.id !== id));
            setIsModalOpen(false); setEditingButton(null);
        }}
        initialConfig={editingButton}
      />
    </div>
  );
};

export default App;