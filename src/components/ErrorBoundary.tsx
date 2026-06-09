import React from "react";

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  React.PropsWithChildren,
  State
> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[color:var(--bg)] p-8 text-center">
          <div className="font-display text-[18px] font-semibold text-[color:var(--ink)]">
            Something went wrong
          </div>
          <p className="max-w-sm text-[13px] text-[color:var(--ink-3)]">
            {this.state.error.message}
          </p>
          <button
            type="button"
            className="rounded-[12px] px-5 py-2 text-[13px] font-semibold text-black"
            style={{ background: "var(--accent)" }}
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
