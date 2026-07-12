import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('ui_error', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-shell">
          <div className="error-banner">
            Something went wrong rendering the dashboard.
            <div className="card-meta" style={{ marginTop: 8 }}>
              {this.state.message}
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
