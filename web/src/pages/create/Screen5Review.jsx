import { useEffect, useRef, useState } from "react";
import { Icons } from "../../components/Icons.jsx";
import ClipPhone from "../../components/ClipPhone.jsx";

const PIPELINE_MILESTONES = [
  { id: "downloading", label: "Media Ingestion", desc: "Download & verify video stream", icon: "📥" },
  { id: "transcribing", label: "Speech Transcription", desc: "Whisper AI word timestamps", icon: "🎙️" },
  { id: "selecting", label: "Viral Hook Selection", desc: "Speech density & hook scoring", icon: "🧠" },
  { id: "rendering", label: "Compositing & Subtitles", desc: "Framing, templates & audio mix", icon: "🎬" },
];

function formatDuration(sec) {
  if (sec == null || isNaN(sec) || sec < 0) return "--";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s < 10 ? "0" : ""}${s}s`;
}

function getStageBadge(stage) {
  switch (stage) {
    case "downloading": return "📥 Ingestion";
    case "transcribing": return "🎙️ Whisper AI";
    case "selecting": return "🧠 Viral AI";
    case "rendering": return "🎬 Compositing";
    case "done": return "✨ Completed";
    case "error": return "⚠️ Error";
    case "cancelled": return "🛑 Cancelled";
    default: return "⚡ Pipeline";
  }
}

export default function Screen5Review({ busy, snap, clips, error, onCancel, onOpenReframe, onBack, onNext }) {
  const [localSeconds, setLocalSeconds] = useState(0);
  const logBodyRef = useRef(null);

  const done = snap?.status === "done";
  const pct = Math.max(0, Math.min(100, Math.round((snap?.progress || 0) * 100)));

  // Current active milestone index
  const curMilestoneIdx = PIPELINE_MILESTONES.findIndex((m) => m.id === snap?.stage);
  const activeIdx = done ? 4 : curMilestoneIdx >= 0 ? curMilestoneIdx : 0;

  // Live timer tick while busy
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => {
      setLocalSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(t);
  }, [busy]);

  const elapsedSec = snap?.elapsed != null ? snap.elapsed : localSeconds;

  // Formatted ETA
  const etaText = (() => {
    if (done) return "0s (Complete)";
    if (snap?.eta != null) {
      if (snap.eta <= 0) return "Finishing up…";
      return formatDuration(snap.eta) + " left";
    }
    if (pct > 5 && pct < 100 && elapsedSec > 2) {
      const totalEst = elapsedSec / (pct / 100);
      const rem = Math.max(1, Math.round(totalEst - elapsedSec));
      return formatDuration(rem) + " left";
    }
    return busy ? "Estimating…" : "--";
  })();

  // Aggregated logs
  const rawLogs = snap?.logs || [];
  const logsList = rawLogs.length > 0 ? rawLogs : (snap?.message ? [
    {
      id: "log-init",
      time: new Date().toLocaleTimeString("en-GB"),
      stage: snap.stage || "queued",
      message: snap.message,
      pct: pct,
    }
  ] : []);

  // Auto-scroll terminal log to bottom on new updates
  useEffect(() => {
    if (logBodyRef.current) {
      logBodyRef.current.scrollTop = logBodyRef.current.scrollHeight;
    }
  }, [logsList.length, snap?.message]);

  return (
    <div className="wizard-screen review-render-screen">
      <div className="card render-dashboard-card">
        {/* Header */}
        <div className="render-dash-head">
          <div className="render-dash-title-group">
            <div className="render-live-indicator">
              <span className={`live-pulse-dot ${done ? "is-done" : busy ? "is-busy" : ""}`} />
              <span className="live-pill-text">
                {done ? "All Clips Ready" : busy ? "Rendering Pipeline Active" : "Processing Paused"}
              </span>
            </div>
            <h2>{done ? "Clips Generated Successfully!" : "Rendering your clips"}</h2>
            <div className="render-dash-sub">
              {snap?.message || "Running automated clipping, reframing, and caption burning pipeline"}
            </div>
          </div>

          <div className="render-head-actions">
            {busy && (
              <button className="btn btn-cancel-render" onClick={onCancel}>
                <span className="cancel-x">✕</span> Cancel Generation
              </button>
            )}
          </div>
        </div>

        {error && <div className="error render-error-banner">{error}</div>}

        {/* Top 4 KPI Metrics */}
        <div className="render-kpi-grid">
          <div className="render-kpi-card">
            <div className="rk-head">
              <span className="rk-label">Total Progress</span>
              <span className="rk-pct">{pct}%</span>
            </div>
            <div className="render-main-track">
              <div
                className={`render-main-fill ${busy && pct < 100 ? "is-glowing" : ""}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="rk-foot">
              {done ? "100% complete" : `${pct}% of full pipeline completed`}
            </div>
          </div>

          <div className="render-kpi-card">
            <div className="rk-head">
              <span className="rk-label">Estimated Time</span>
              <span className="rk-icon">⏳</span>
            </div>
            <div className="rk-value">{etaText}</div>
            <div className="rk-foot">
              {done ? "All tasks finished" : "Real-time calculation"}
            </div>
          </div>

          <div className="render-kpi-card">
            <div className="rk-head">
              <span className="rk-label">Time Elapsed</span>
              <span className="rk-icon">⏱️</span>
            </div>
            <div className="rk-value">{formatDuration(elapsedSec)}</div>
            <div className="rk-foot">Active processing time</div>
          </div>

          <div className="render-kpi-card">
            <div className="rk-head">
              <span className="rk-label">Clips Rendered</span>
              <span className="rk-icon">🎬</span>
            </div>
            <div className="rk-value">{clips.length} ready</div>
            <div className="rk-foot">
              {clips.length > 0 ? "Ready for preview & download" : "Encoding in progress"}
            </div>
          </div>
        </div>

        {/* Milestone Steps Bar */}
        <div className="milestones-container">
          <div className="milestones-track">
            {PIPELINE_MILESTONES.map((m, i) => {
              const isPast = done || i < activeIdx;
              const isCurrent = !done && i === activeIdx;
              return (
                <div
                  key={m.id}
                  className={`milestone-item ${isPast ? "is-done" : isCurrent ? "is-current" : "is-pending"}`}
                >
                  <div className="milestone-badge">
                    {isPast ? (
                      <span className="milestone-check">✓</span>
                    ) : isCurrent ? (
                      <span className="milestone-spinner" />
                    ) : (
                      <span className="milestone-num">{i + 1}</span>
                    )}
                  </div>
                  <div className="milestone-text">
                    <div className="milestone-title">{m.icon} {m.label}</div>
                    <div className="milestone-desc">{m.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Live Animated Step Log / Terminal */}
        <div className="log-console-wrap">
          <div className="log-console-header">
            <div className="log-console-title">
              <span className="log-term-icon">❯_</span> Live Pipeline Event Log
            </div>
            <div className="log-console-status">
              <span className={`log-live-dot ${busy ? "pulsing" : ""}`} />
              {busy ? "STREAMING LIVE" : done ? "COMPLETED" : "IDLE"}
            </div>
          </div>

          <div className="log-console-body" ref={logBodyRef}>
            {logsList.map((entry, idx) => (
              <div
                key={entry.id || idx}
                className={`log-line-item log-stage-${entry.stage || "default"}`}
                style={{ animationDelay: `${Math.min(idx * 0.05, 0.4)}s` }}
              >
                <span className="log-line-time">[{entry.time}]</span>
                <span className={`log-line-tag tag-${entry.stage}`}>
                  {getStageBadge(entry.stage)}
                </span>
                <span className="log-line-msg">{entry.message}</span>
                {entry.pct != null && (
                  <span className="log-line-pct">{entry.pct}%</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Generated Clips Grid */}
      {clips.length > 0 && (
        <div className="card clips-showcase-card">
          <div className="card-h">
            <div>
              <h2>Rendered Clips ({clips.length})</h2>
              <div className="sub">Review your vertical shorts, download or fine-tune reframing</div>
            </div>
          </div>
          <div className="clips">
            {clips.map((c) => (
              <div className="clip" key={c.index}>
                <ClipPhone src={c.url} filename={c.filename} />
                <div className="meta">
                  <h3>{c.title}</h3>
                  <div className="sub">
                    {(c.end - c.start).toFixed(1)}s · {c.start.toFixed(1)}s – {c.end.toFixed(1)}s
                  </div>
                  <div className="acts">
                    <a href={c.url} download={c.filename || ""} className="btn-dl">
                      <Icons.download /> Download
                    </a>
                    <button onClick={() => onOpenReframe(c)} className="btn-reframe">
                      <Icons.crop /> Reframe
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer Navigation */}
      <div className="wizard-nav">
        <button className="btn btn-ghost" onClick={onBack} disabled={busy}>
          ← Back to music & effects
        </button>
        <button
          className="btn btn-primary"
          disabled={!done || !clips.length}
          onClick={onNext}
        >
          Continue to export →
        </button>
      </div>
    </div>
  );
}
