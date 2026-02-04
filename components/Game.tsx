'use client';

import { useEffect, useRef, useState } from 'react';
import { GameEngine } from '@/lib/game/engine';

const SAVE_KEY = 'chopping_choppers_save';

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set initial size
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Create and start game engine
    const engine = new GameEngine(canvas);
    engineRef.current = engine;

    // Wire up save modal callback from engine
    engine.onSaveRequested = () => setShowSaveModal(true);

    engine.start();

    // Handle window resize
    const handleResize = () => {
      engine.resize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      engine.stop();
    };
  }, []);

  const exportSave = () => {
    const saveData = localStorage.getItem(SAVE_KEY);
    if (!saveData) {
      alert('No save data found!');
      return;
    }
    const blob = new Blob([saveData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chopping-choppers-save-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importSave = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        // Validate it looks like a save file
        if (typeof data.money !== 'number' && typeof data.totalWoodChopped !== 'number') {
          alert('This does not appear to be a valid Chopping Choppers save file!');
          return;
        }
        localStorage.setItem(SAVE_KEY, JSON.stringify(data));
        alert(`Save imported! Money: $${data.money || 0}, Total Wood: ${data.totalWoodChopped || 0}. Refreshing...`);
        window.location.reload();
      } catch (err) {
        console.error('Import error:', err);
        alert('Invalid save file! Could not parse JSON.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
        }}
      />
      {showSaveModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowSaveModal(false)}
        >
          <div
            style={{
              background: '#1a1a2e',
              padding: '30px',
              borderRadius: '12px',
              maxWidth: '400px',
              width: '90%',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ color: 'white', marginBottom: '10px' }}>💾 Save Management</h2>
            <p style={{ color: '#aaa', marginBottom: '20px' }}>Export your save to back it up, or import a previous save.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button onClick={exportSave} style={{ padding: '12px', background: '#4a9', border: 'none', borderRadius: '8px', color: 'white', cursor: 'pointer' }}>
                📥 Export Save
              </button>
              <label style={{ padding: '12px', background: '#49a', border: 'none', borderRadius: '8px', color: 'white', cursor: 'pointer', textAlign: 'center' }}>
                📤 Import Save
                <input type="file" accept=".json" onChange={importSave} style={{ display: 'none' }} />
              </label>
              <button onClick={() => setShowSaveModal(false)} style={{ padding: '12px', background: '#666', border: 'none', borderRadius: '8px', color: 'white', cursor: 'pointer', marginTop: '10px' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
