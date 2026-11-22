import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  // Use constructor or field initializer safely
  public override state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error in application:", error, errorInfo);
  }

  public override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{
          backgroundColor: '#050816',
          color: '#ffffff',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          fontFamily: 'sans-serif',
          textAlign: 'center'
        }}>
          <div style={{
            backgroundColor: '#070C1E',
            border: '1px solid rgba(0, 217, 255, 0.35)',
            borderRadius: '0px',
            padding: '24px',
            maxWidth: '480px',
            width: '100%',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.85)'
          }}>
            <h2 style={{ color: '#00D9FF', margin: '0 0 12px 0', fontSize: '20px', fontWeight: 'bold' }}>
              M R S IPTV Compatibility Mode
            </h2>
            <p style={{ color: '#C9D1E0', fontSize: '14px', lineHeight: '1.5', marginBottom: '20px' }}>
              A temporary display error occurred on this browser or Android device. Click below to reload M R S IPTV in full legacy compatibility mode.
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              style={{
                background: 'linear-gradient(135deg, #00B8E6 0%, #176BFF 50%, #9333EA 100%)',
                color: '#ffffff',
                border: '1px solid #00D9FF',
                borderRadius: '0px',
                padding: '12px 24px',
                fontSize: '14px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              Reload M R S IPTV
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
