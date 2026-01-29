import React from 'react';

type VisualizationErrorBoundaryProps = {
  children: React.ReactNode;
  title?: string;
};

type VisualizationErrorBoundaryState = {
  hasError: boolean;
};

export class VisualizationErrorBoundary extends React.Component<
  VisualizationErrorBoundaryProps,
  VisualizationErrorBoundaryState
> {
  state: VisualizationErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('[VisualizationErrorBoundary] render failed', error);
  }

  private handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-200">
          <div className="font-medium text-amber-100">
            {this.props.title ?? 'Visualization failed to render'}
          </div>
          <div className="mt-1 text-[11px] text-amber-200/80">
            Try again after updating the data.
          </div>
          <button
            type="button"
            onClick={this.handleReset}
            className="mt-3 inline-flex items-center rounded-lg border border-amber-400/40 bg-amber-500/20 px-3 py-1 text-[11px] font-medium text-amber-100 transition-colors hover:bg-amber-500/30"
          >
            Retry Render
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
