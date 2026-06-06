import { useState, useEffect, useCallback } from 'react';

const listeners = new Set();
let _id = 0;

export function toast(message, type = 'info', duration = 4000) {
  const id = ++_id;
  listeners.forEach(fn => fn({ id, message, type, duration }));
}

export function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  const onToast = useCallback(t => {
    setToasts(prev => [...prev, t]);
    setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), t.duration);
  }, []);

  useEffect(() => {
    listeners.add(onToast);
    return () => listeners.delete(onToast);
  }, [onToast]);

  if (!toasts.length) return null;

  const BG = { success: '#1D9E75', error: '#D85A30', info: '#333' };

  return (
    <>
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
        display: 'flex', flexDirection: 'column', gap: 8,
        pointerEvents: 'none',
      }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            background: BG[t.type] ?? BG.info,
            color: '#fff',
            padding: '10px 14px',
            borderRadius: 8,
            fontSize: 13,
            lineHeight: 1.5,
            boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
            maxWidth: 360,
            display: 'flex', alignItems: 'flex-start', gap: 10,
            pointerEvents: 'all',
            animation: 'toastIn 0.2s ease',
          }}>
            <span style={{ flex: 1 }}>{t.message}</span>
            <button
              onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
              style={{
                background: 'none', border: 'none', color: 'rgba(255,255,255,0.75)',
                cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0, flexShrink: 0,
              }}
            >×</button>
          </div>
        ))}
      </div>
    </>
  );
}
