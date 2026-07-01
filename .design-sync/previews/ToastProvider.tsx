import { ToastProvider, useToast } from 'openleague';
import * as React from 'react';

// The toast API is consumed via the useToast() hook. This demo raises a success
// toast on mount so the Snackbar/Alert visual is captured statically.
function ToastDemo() {
  const toast = useToast();
  React.useEffect(() => {
    toast.showSuccess('Roster saved — 18 players notified');
  }, []);
  return (
    <div style={{ padding: '20px 12px', color: 'rgba(0,0,0,0.55)', fontSize: 14, lineHeight: 1.5 }}>
      Wrap your app in <code>&lt;ToastProvider&gt;</code>, then call{' '}
      <code>useToast()</code> from any descendant to raise success, error,
      warning, or info toasts.
    </div>
  );
}

export const Toasts = () => (
  <ToastProvider>
    <ToastDemo />
  </ToastProvider>
);
