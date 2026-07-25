import { Component } from 'react';
import StatusMessage from './components/StatusMessage/StatusMessage.jsx';

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
          <StatusMessage type="error" message="Το σύστημα τηλεματικής του ΟΑΣΑ δεν απαντάει αυτή τη στιγμή." />
        </main>
      );
    }
    return this.props.children;
  }
}
