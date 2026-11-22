import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an unhandled render error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  handleClear = () => {
    try {
      localStorage.removeItem("cf_active_project_draft");
    } catch {}
    this.setState({ hasError: false, error: null });
    if (this.props.onClear) {
      this.props.onClear();
    } else {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="error-boundary-screen"
          style={{
            minHeight: "420px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "40px 20px",
            textAlign: "center",
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: "560px",
              width: "100%",
              padding: "32px",
              border: "1px solid var(--danger, #ef4444)",
              background: "var(--surface, #1e222b)",
              borderRadius: "16px",
              boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ fontSize: "42px", marginBottom: "16px" }}>⚠️</div>
            <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "8px", color: "var(--fg, #fff)" }}>
              Something went wrong displaying this screen
            </h2>
            <p style={{ color: "var(--muted-2, #94a3b8)", fontSize: "14px", lineHeight: "1.5", marginBottom: "20px" }}>
              The application encountered an unexpected render issue while restoring project settings.
              Don't worry, your files and progress are safe!
            </p>
            {this.state.error?.message && (
              <div
                style={{
                  background: "rgba(0,0,0,0.4)",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  fontFamily: "monospace",
                  fontSize: "12px",
                  color: "var(--danger, #ef4444)",
                  marginBottom: "20px",
                  textAlign: "left",
                  wordBreak: "break-all",
                }}
              >
                {this.state.error.message}
              </div>
            )}
            <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={this.handleReset}
              >
                📐 Reset to Step 2 (Layout &amp; Framing)
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={this.handleClear}
              >
                🗑️ Clear Saved Draft &amp; Start Fresh
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
