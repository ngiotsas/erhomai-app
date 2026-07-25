import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error('[error-boundary]', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main style={{ maxWidth: 480, margin: '0 auto', padding: '16px 0' }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, paddingBottom: 8, borderBottom: '1px solid #d4d4d4' }}>
            Έρχομαι
          </h1>
          <div style={{
            fontSize: 14, padding: '12px 16px', borderRadius: 6, marginTop: 16,
            border: '1px solid #fca5a5', color: '#b91c1c', background: '#fef2f2',
          }}>
            <p>Κάτι πήγε στραβά.</p>
            <p>Something went wrong.</p>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}
