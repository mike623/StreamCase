import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BroadcastMessage, DeckButtonConfig, DEFAULT_BUTTONS } from './types';
import { cn } from './utils/cn';
import { DeckButton } from './components/DeckButton';
import { EditModal } from './components/EditModal';
import { Button, Card, CardContent, Input, Label, Dialog } from './components/ui';
import { Icon } from './components/Icon';
import { Peer, DataConnection } from 'peerjs';
import QRCode from 'qrcode';
import { Html5QrcodeScanner } from 'html5-qrcode';

const App = () => {
  const [buttons, setButtons] = useState<DeckButtonConfig[]>(DEFAULT_BUTTONS);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingButton, setEditingButton] = useState<DeckButtonConfig | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [logs, setLogs] = useState<{msg: string, type: 'info' | 'error' | 'broadcast', time: number}[]>([]);
  
  // P2P State
  const [peerId, setPeerId] = useState<string>('');
  const [connections, setConnections] = useState<DataConnection[]>([]);
  const [isPeerReady, setIsPeerReady] = useState(false);
  
  // Notifications State
  const [isNotificationSupported, setIsNotificationSupported] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<string>('default');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  // Modals
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isScannerActive, setIsScannerActive] = useState(false);
  
  const peerRef = useRef<Peer | null>(null);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  const addLog = useCallback((msg: string, type: 'info' | 'error' | 'broadcast' = 'info') => {
    setLogs(prev => [{ msg, type, time: Date.now() }, ...prev].slice(0, 100));
    console.log(`[StreamCast] ${type.toUpperCase()}: ${msg}`);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('streamcast_buttons');
    if (saved) {
      try { setButtons(JSON.parse(saved)); } catch (e) { addLog('Failed to load saved buttons', 'error'); }
    }

    // Platform detection
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const standalone = (window.navigator as any).standalone || window.matchMedia('(display-mode: standalone)').matches;
    setIsIOS(ios);
    setIsStandalone(standalone);
    
    // Notification Support Check
    const supported = ('Notification' in window) && ('serviceWorker' in navigator);
    setIsNotificationSupported(supported);
    
    if (supported) {
      const currentPermission = Notification.permission;
      setNotificationPermission(currentPermission);
      if (currentPermission === 'granted') {
        setNotificationsEnabled(true);
      }
      addLog(`System: Notification engine initialized. Status: ${currentPermission}`);
    } else {
      addLog('System: Notification API not detected. Mobile Safari requires PWA installation.', 'info');
    }
  }, [addLog]);

  const requestNotificationPermission = async () => {
    if (!isNotificationSupported) {
      if (isIOS && !isStandalone) {
        alert("To enable notifications on iOS, please add this app to your Home Screen first.");
      } else {
        alert("Notifications are not supported on this device/browser.");
      }
      return;
    }

    if (Notification.permission === 'denied') {
      alert("Notification access is blocked. Please enable it in your browser site settings.");
      return;
    }

    addLog('Prompting for notification permission...');
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      
      if (permission === 'granted') {
        setNotificationsEnabled(true);
        addLog('Notification permission granted successfully.');
        
        const registration = await navigator.serviceWorker.ready;
        if (registration && 'showNotification' in registration) {
          registration.showNotification("StreamCast Deck", {
            body: "Notifications are active! You will receive alerts for all incoming broadcasts.",
            icon: 'https://cdn-icons-png.flaticon.com/512/3661/3661502.png',
            tag: 'streamcast-verify'
          });
        }
      } else {
        addLog(`Notification permission declined: ${permission}`);
      }
    } catch (err) {
      addLog(`Permission Request Error: ${err}`, 'error');
    }
  };

  const showLocalNotification = useCallback(async (msg: BroadcastMessage) => {
    addLog(`Attempting notification for: ${msg.buttonId}...`);

    if (Notification.permission !== 'granted') {
      addLog(`Notification failed: Permission is ${Notification.permission}. Triggering request fallback.`, 'error');
      requestNotificationPermission();
      return;
    }

    if (!notificationsEnabled) {
      addLog('Notification skipped: User disabled alerts in UI toggle.', 'info');
      return;
    }
    
    try {
      const btn = buttons.find(b => b.id === msg.buttonId);
      const label = btn?.label || 'Remote Command';
      const body = typeof msg.payload === 'string' ? msg.payload : JSON.stringify(msg.payload);

      addLog('Waiting for ServiceWorker registration...');
      const registration = await navigator.serviceWorker.ready;
      
      if (registration && 'showNotification' in registration) {
        addLog('SW Ready. Triggering showNotification...');
        await (registration as ServiceWorkerRegistration).showNotification(`StreamCast: ${label}`, {
          body,
          icon: 'https://cdn-icons-png.flaticon.com/512/3661/3661502.png',
          badge: 'https://cdn-icons-png.flaticon.com/512/3661/3661502.png',
          vibrate: [200, 100, 200],
          tag: `msg-${Date.now()}`,
          renotify: true,
          requireInteraction: false
        } as any);
        addLog(`Notification delivered for broadcast: ${label}`);
      } else {
        addLog('SW Notification not available. Falling back to window.Notification...', 'info');
        new Notification(`StreamCast: ${label}`, { body });
        addLog(`Legacy notification triggered for: ${label}`);
      }
    } catch (err) {
      addLog(`Notification execution failed: ${err}`, 'error');
    }
  }, [notificationsEnabled, buttons, addLog]);

  const testNotification = () => {
    addLog('User triggered manual test notification.');
    showLocalNotification({
      type: 'BUTTON_PRESS',
      buttonId: 'test-debug',
      payload: 'This is a test notification from the debug panel.',
      timestamp: Date.now()
    });
  };

  // PeerJS setup
  useEffect(() => {
    const peer = new Peer();
    peerRef.current = peer;

    peer.on('open', (id) => {
      setPeerId(id);
      setIsPeerReady(true);
      addLog(`Network: P2P Ready. My ID: ${id}`);
      QRCode.toDataURL(id, { width: 300, margin: 2 }).then(setQrDataUrl);
    });

    peer.on('connection', (conn) => {
      addLog(`Peer connected: ${conn.peer}`);
      setupConnection(conn);
    });

    peer.on('error', (err) => {
      addLog(`P2P Engine Error: ${err.message}`, 'error');
    });

    return () => { peer.destroy(); };
  }, [addLog]);

  const setupConnection = (conn: DataConnection) => {
    conn.on('open', () => {
      setConnections(prev => {
        if (prev.find(c => c.peer === conn.peer)) return prev;
        return [...prev, conn];
      });
    });

    conn.on('data', (data) => {
      const msg = data as BroadcastMessage;
      addLog(`Received broadcast: ${msg.buttonId}`, 'broadcast');
      showLocalNotification(msg);
    });

    conn.on('close', () => {
      addLog(`Peer disconnected: ${conn.peer}`);
      setConnections(prev => prev.filter(c => c.peer !== conn.peer));
    });
  };

  const connectToPeer = (targetId: string) => {
    const cleanId = targetId.trim();
    if (!peerRef.current || !cleanId || cleanId === peerId) return;
    addLog(`Connecting to peer: ${cleanId}...`);
    const conn = peerRef.current.connect(cleanId);
    setupConnection(conn);
    setIsConnectModalOpen(false);
  };

  // QR Logic
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
        scannerRef.current.clear().catch(e => {});
        scannerRef.current = null;
      }
    };
  }, [isScannerActive]);

  const stopScanner = () => {
    setIsScannerActive(false);
    if (scannerRef.current) {
      scannerRef.current.clear().catch(e => {});
      scannerRef.current = null;
    }
  };

  const handleBroadcast = (id: string) => {
    const btn = buttons.find(b => b.id === id);
    if (!btn) return;
    const message: BroadcastMessage = {
      type: 'BUTTON_PRESS',
      buttonId: id,
      payload: btn.payload,
      timestamp: Date.now()
    };
    addLog(`Sending Broadcast: ${btn.label}`, 'broadcast');
    connections.forEach(conn => conn.open && conn.send(message));
  };

  const copyId = () => {
    navigator.clipboard.writeText(peerId);
    addLog('Peer ID copied to clipboard');
  };

  const saveButtons = (newButtons: DeckButtonConfig[]) => {
    setButtons(newButtons);
    localStorage.setItem('streamcast_buttons', JSON.stringify(newButtons));
  };

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-5xl mx-auto pb-10 selection:bg-primary/30 font-sans">
      <header className="border-b border-border sticky top-0 bg-background/90 backdrop-blur-md z-40">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="bg-primary p-2 rounded-lg shadow-lg shadow-primary/20">
              <Icon name="radio" className="text-white w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-sm md:text-base leading-tight">StreamCast</h1>
              <div className="flex items-center gap-2">
                <span className={cn("w-2 h-2 rounded-full", isPeerReady ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" : "bg-red-500 animate-pulse")} />
                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest truncate max-w-[80px]">
                  {connections.length > 0 ? `${connections.length} Peer(s)` : 'Standby'}
                </span>
              </div>
            </div>
          </div>
          
          <div className="flex gap-1 md:gap-2">
            <Button 
              variant="ghost" 
              size="icon" 
              className={cn(
                "rounded-full h-8 w-8 md:h-10 md:w-10 transition-all relative", 
                notificationPermission === 'granted' ? (notificationsEnabled ? "text-primary bg-primary/10" : "text-muted-foreground bg-muted/20") : 
                notificationPermission === 'denied' ? "text-red-500 bg-red-500/10" : 
                "text-muted-foreground bg-muted/10",
                !isNotificationSupported && "opacity-40 grayscale"
              )}
              onClick={() => {
                if (notificationPermission !== 'granted') {
                  requestNotificationPermission();
                } else {
                  setNotificationsEnabled(!notificationsEnabled);
                  addLog(`Alerts toggled: ${!notificationsEnabled ? 'OFF' : 'ON'}`);
                }
              }}
              title={isNotificationSupported ? `Permission: ${notificationPermission}` : "Notifications not supported"}
            >
              <Icon name={notificationsEnabled ? "bell" : "bell-off"} className="w-4 h-4 md:w-5 md:h-5" />
              {notificationPermission === 'default' && (
                <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary"></span>
                </span>
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setIsConnectModalOpen(true)} className="h-8 md:h-10 text-xs">
              <Icon name="zap" className="w-3 h-3 md:w-4 md:h-4 mr-1 md:mr-2" /> Connect
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setIsEditMode(!isEditMode)} className="h-8 md:h-10 text-xs">
              <Icon name={isEditMode ? "check" : "edit"} className={cn("w-3 h-3 md:w-4 md:h-4", isEditMode && "text-emerald-500")} />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Icon name="command" className="w-3 h-3" /> Control Surface
            </h2>
            {isEditMode && (
              <Button size="sm" variant="outline" onClick={() => setIsModalOpen(true)} className="h-7 text-[9px] px-2 uppercase font-bold">
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
          
          {isIOS && !isStandalone && (
            <Card className="bg-blue-500/10 border-blue-500/30 p-4 rounded-xl border-dashed">
               <div className="flex items-start gap-3">
                 <Icon name="smartphone" className="text-blue-400 w-5 h-5 shrink-0 mt-1" />
                 <div>
                   <h3 className="text-sm font-bold text-blue-100">Action Required: iOS Setup</h3>
                   <p className="text-xs text-blue-200/70 mt-1 leading-relaxed">
                     To receive alerts and use the full control deck, tap 'Share' and then <span className="text-blue-300 font-bold">"Add to Home Screen"</span>.
                   </p>
                 </div>
               </div>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Icon name="activity" className="w-3 h-3" /> System Logs
            </h2>
            <Button 
              size="sm" 
              variant="ghost" 
              onClick={testNotification}
              className="h-6 text-[8px] uppercase tracking-tighter px-2 bg-primary/5 hover:bg-primary/20 text-primary border border-primary/20"
            >
              Test Notification
            </Button>
          </div>
          
          <Card className="bg-black/40 border-border overflow-hidden">
            <CardContent className="p-0 h-[300px] lg:h-[450px] overflow-y-auto font-mono text-[10px]">
              {logs.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground opacity-20 p-8 text-center">
                  <Icon name="radio" className="w-8 h-8 mb-2" />
                  <p>Awaiting events...</p>
                </div>
              )}
              <div className="divide-y divide-white/[0.05]">
                {logs.map((log, i) => (
                  <div key={i} className={cn(
                    "p-2 flex gap-2 items-start transition-colors",
                    log.type === 'error' ? "text-red-400 bg-red-400/5" : 
                    log.type === 'broadcast' ? "text-emerald-400 bg-emerald-400/5" : 
                    "text-zinc-400"
                  )}>
                    <span className="opacity-30 shrink-0">[{new Date(log.time).toLocaleTimeString([], {hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit'})}]</span>
                    <span className="break-all">{log.msg}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          
          <div className="flex flex-wrap gap-2 px-1">
             <div className={cn("text-[8px] px-1.5 py-0.5 rounded border uppercase font-bold", isNotificationSupported ? "border-emerald-500/30 text-emerald-400" : "border-red-500/30 text-red-400")}>
               Push Service: {isNotificationSupported ? 'READY' : 'NC'}
             </div>
             <div className="text-[8px] px-1.5 py-0.5 rounded border border-muted-foreground/30 text-muted-foreground uppercase font-bold">
               Permission: {notificationPermission.toUpperCase()}
             </div>
          </div>
        </div>
      </main>

      <Dialog open={isConnectModalOpen} onClose={() => { setIsConnectModalOpen(false); stopScanner(); }}>
        <div className="space-y-6 py-4">
          <div className="text-center space-y-2">
            <h2 className="text-xl font-bold">Connect Peers</h2>
            <p className="text-sm text-muted-foreground">Broadcast messages to connected devices.</p>
          </div>

          <div className="flex flex-col items-center gap-4">
            {isScannerActive ? (
              <div className="w-full max-w-[300px] aspect-square bg-black rounded-xl overflow-hidden relative border-2 border-primary">
                <div id="reader" className="w-full h-full"></div>
                <Button variant="destructive" size="sm" className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10" onClick={stopScanner}>
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="space-y-4 flex flex-col items-center w-full">
                {qrDataUrl && (
                  <div className="bg-white p-4 rounded-xl shadow-xl transition-transform hover:scale-105">
                    <img src={qrDataUrl} alt="Pairing QR" className="w-40 h-40 md:w-48 md:h-48" />
                  </div>
                )}
                <div className="text-center w-full max-w-[280px]">
                  <div className="bg-muted/30 p-2 rounded border border-border flex items-center justify-between gap-2 mb-4 group cursor-pointer" onClick={copyId}>
                    <p className="text-[10px] font-mono opacity-50 truncate">MY ID: {peerId}</p>
                    <Icon name="copy" className="w-3 h-3 opacity-0 group-hover:opacity-50" />
                  </div>
                  <Button onClick={() => setIsScannerActive(true)} className="w-full shadow-lg shadow-primary/20">
                    <Icon name="camera" className="w-4 h-4 mr-2" /> Scan Peer QR
                  </Button>
                </div>
              </div>
            )}
          </div>
          
          <div className="border-t border-border pt-4">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground block mb-2">Manual Entry</Label>
            <div className="flex gap-2">
              <Input 
                id="manual-peer-id"
                placeholder="Paste Peer ID..." 
                className="font-mono text-xs h-9"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    connectToPeer((e.currentTarget as HTMLInputElement).value);
                    e.currentTarget.value = '';
                  }
                }}
              />
              <Button size="sm" className="h-9 px-3" onClick={() => {
                const input = document.getElementById('manual-peer-id') as HTMLInputElement;
                if (input) {
                  connectToPeer(input.value);
                  input.value = '';
                }
              }}>Go</Button>
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
            addLog(`Button saved: ${config.label}`);
        }}
        onDelete={(id) => {
            saveButtons(buttons.filter(b => b.id !== id));
            setIsModalOpen(false); setEditingButton(null);
            addLog(`Button deleted.`);
        }}
        initialConfig={editingButton}
      />
    </div>
  );
};

export default App;