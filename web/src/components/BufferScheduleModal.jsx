import { useEffect, useState } from "react";
import { api } from "../api.js";
import { Icons } from "./Icons.jsx";

const SERVICE_BADGES = {
  tiktok: { label: "TikTok", icon: "🎵", color: "#FE2C55" },
  instagram: { label: "Instagram", icon: "📸", color: "#E1306C" },
  youtube: { label: "YouTube Shorts", icon: "▶️", color: "#FF0000" },
  twitter: { label: "X / Twitter", icon: "𝕏", color: "#1D9BF0" },
  facebook: { label: "Facebook", icon: "📘", color: "#1877F2" },
  linkedin: { label: "LinkedIn", icon: "💼", color: "#0A66C2" },
  pinterest: { label: "Pinterest", icon: "📌", color: "#BD081C" },
};

export default function BufferScheduleModal({ clip, onClose, onOpenSettings }) {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [caption, setCaption] = useState(clip?.title || "Check out this short! 🔥 #Shorts #Viral");
  const [mediaUrl, setMediaUrl] = useState("");
  const [publishMode, setPublishMode] = useState("schedule"); // 'now' | 'schedule'
  const [scheduleTime, setScheduleTime] = useState(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000); // Default to 1 hour from now
    d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15);
    d.setSeconds(0);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    async function init() {
      try {
        const st = await api.bufferStatus();
        if (!alive) return;
        setStatus(st);

        // Derive media URL
        const clipUrl = clip?.url || "";
        const base = (st.public_base_url || location.origin).replace(/\/$/, "");
        const fullMedia = clipUrl.startsWith("http") ? clipUrl : `${base}${clipUrl.startsWith("/") ? "" : "/"}${clipUrl}`;
        setMediaUrl(fullMedia);

        if (st.configured && st.ok) {
          const profs = await api.bufferProfiles();
          if (!alive) return;
          setProfiles(Array.isArray(profs) ? profs : []);
          const defs = (profs || []).filter((p) => p.default).map((p) => p.id);
          setSelectedIds(defs.length > 0 ? defs : (profs || []).slice(0, 1).map((p) => p.id));
        }
      } catch (err) {
        if (alive) setError(err.message || "Failed to load Buffer status");
      } finally {
        if (alive) setLoading(false);
      }
    }
    init();
    return () => { alive = false; };
  }, [clip]);

  const toggleProfile = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === profiles.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(profiles.map((p) => p.id));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedIds.length) {
      setError("Please select at least one social channel to publish to.");
      return;
    }
    if (!caption.trim()) {
      setError("Please write a caption or description for your post.");
      return;
    }
    if (!mediaUrl.trim()) {
      setError("A reachable video URL is required by Buffer.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const scheduledAt = publishMode === "schedule"
        ? Math.floor(new Date(scheduleTime).getTime() / 1000)
        : null;

      const payload = {
        profile_ids: selectedIds,
        text: caption.trim(),
        media_url: mediaUrl.trim(),
        clip_path: clip?.url,
        now: publishMode === "now",
        scheduled_at: scheduledAt,
        title: clip?.title,
      };

      const res = await api.bufferSchedule(payload);
      setResult(res);
    } catch (err) {
      setError(err.message || "Failed to schedule via Buffer.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="transcript-prompt-overlay" onClick={onClose}>
      <div
        className="transcript-prompt-modal card"
        style={{ maxWidth: "680px", width: "95%", maxHeight: "90vh", overflowY: "auto", padding: "28px" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
              <span style={{ fontSize: "24px" }}>🚀</span>
              <h2 style={{ fontSize: "20px", fontWeight: 800, margin: 0, color: "var(--fg, #fff)" }}>
                Schedule &amp; Publish with Buffer
              </h2>
            </div>
            <p style={{ margin: 0, fontSize: "13px", color: "var(--muted-2, #94a3b8)" }}>
              Directly distribute your vertical short across TikTok, Instagram Reels, YouTube Shorts, and X.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ padding: "4px 10px", fontSize: "16px" }}
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "40px" }}>
            <span className="spinner" style={{ display: "inline-block", width: "24px", height: "24px" }} />
            <div style={{ marginTop: "12px", fontSize: "13px", color: "var(--muted, #94a3b8)" }}>
              Connecting to Buffer.com…
            </div>
          </div>
        ) : !status?.configured || !status?.ok ? (
          /* Not Configured State */
          <div style={{ padding: "24px", background: "var(--surface-2, rgba(255,255,255,0.04))", borderRadius: "12px", border: "1px dashed var(--line-2, #334155)", textAlign: "center" }}>
            <div style={{ fontSize: "36px", marginBottom: "12px" }}>🔑</div>
            <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "8px" }}>Buffer API Token Required</h3>
            <p style={{ fontSize: "13px", color: "var(--muted-2, #94a3b8)", maxWidth: "460px", margin: "0 auto 18px", lineHeight: "1.5" }}>
              To post or schedule content directly, connect your Buffer.com account in ClipForge Settings using your personal API Access Token.
            </p>
            {status?.error && (
              <div style={{ color: "var(--danger, #ef4444)", fontSize: "12px", marginBottom: "16px" }}>
                {status.error}
              </div>
            )}
            <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
              {onOpenSettings && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    onClose();
                    onOpenSettings();
                  }}
                >
                  ⚙️ Open Settings &amp; Connect Buffer
                </button>
              )}
              <a
                href="https://buffer.com/developers/apps"
                target="_blank"
                rel="noreferrer"
                className="btn btn-secondary"
              >
                Get Buffer Token ↗
              </a>
            </div>
          </div>
        ) : result ? (
          /* Success Result State */
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: "48px", marginBottom: "12px" }}>✨</div>
            <h3 style={{ fontSize: "18px", fontWeight: 800, color: "var(--accent, #b6ff2e)", marginBottom: "8px" }}>
              {publishMode === "now" ? "Post Published Successfully!" : "Clip Scheduled in Buffer Queue!"}
            </h3>
            <p style={{ fontSize: "14px", color: "var(--muted, #cbd5e1)", maxWidth: "500px", margin: "0 auto 24px" }}>
              {publishMode === "now"
                ? "Your short has been dispatched to Buffer for immediate publishing across your selected channels."
                : `Your short is queued and scheduled to go live at ${new Date(scheduleTime).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}.`}
            </p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              <a
                href="https://publish.buffer.com/"
                target="_blank"
                rel="noreferrer"
                className="btn btn-primary"
              >
                View in Buffer Dashboard ↗
              </a>
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : (
          /* Active Scheduling Form */
          <form onSubmit={handleSubmit}>
            {error && (
              <div style={{ background: "rgba(239,68,68,0.15)", border: "1px solid var(--danger, #ef4444)", color: "var(--danger, #ef4444)", padding: "10px 14px", borderRadius: "8px", fontSize: "13px", marginBottom: "18px" }}>
                {error}
              </div>
            )}

            {/* 1. Target Social Channels */}
            <div style={{ marginBottom: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <label className="fieldlabel" style={{ margin: 0 }}>
                  1. Select Destination Channels ({selectedIds.length}/{profiles.length})
                </label>
                {profiles.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ fontSize: "11px", padding: "2px 8px" }}
                    onClick={handleSelectAll}
                  >
                    {selectedIds.length === profiles.length ? "Deselect All" : "Select All"}
                  </button>
                )}
              </div>

              {profiles.length === 0 ? (
                <div style={{ padding: "16px", background: "var(--surface-2)", borderRadius: "8px", fontSize: "13px", color: "var(--muted-2)" }}>
                  No social channels found on this Buffer account. Please connect at least one profile in your Buffer dashboard.
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "10px" }}>
                  {profiles.map((p) => {
                    const active = selectedIds.includes(p.id);
                    const badge = SERVICE_BADGES[p.service] || { label: p.service, icon: "🌐", color: "#64748B" };
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => toggleProfile(p.id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          padding: "10px 12px",
                          borderRadius: "10px",
                          border: `1.5px solid ${active ? "var(--accent, #b6ff2e)" : "var(--line, rgba(255,255,255,0.1))"}`,
                          background: active ? "rgba(182,255,46,0.08)" : "var(--surface-2, rgba(255,255,255,0.03))",
                          cursor: "pointer",
                          textAlign: "left",
                          transition: "all 0.15s ease",
                        }}
                      >
                        {p.avatar ? (
                          <img src={p.avatar} alt={p.username} style={{ width: "32px", height: "32px", borderRadius: "50%", objectFit: "cover" }} />
                        ) : (
                          <span style={{ fontSize: "20px" }}>{badge.icon}</span>
                        )}
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--fg, #fff)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {p.username}
                          </div>
                          <div style={{ fontSize: "11px", color: badge.color, display: "flex", alignItems: "center", gap: "4px" }}>
                            <span>{badge.icon}</span>
                            <span>{badge.label}</span>
                          </div>
                        </div>
                        <span style={{ fontSize: "14px", color: active ? "var(--accent, #b6ff2e)" : "transparent" }}>
                          ✓
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 2. Caption & Hashtags */}
            <div style={{ marginBottom: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <label className="fieldlabel" style={{ margin: 0 }}>2. Caption &amp; Hashtags</label>
                <span className="ctl-hint">{caption.length} chars</span>
              </div>
              <textarea
                rows={3}
                className="title-area"
                style={{ width: "100%", padding: "10px 12px", fontSize: "13px", lineHeight: "1.5" }}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Write an engaging hook, summary, and hashtags…"
              />
              <div style={{ display: "flex", gap: "6px", marginTop: "6px", flexWrap: "wrap" }}>
                {["#Shorts", "#Reels", "#Viral", "#FYP", "#Trending", "#YouTubeShorts"].map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className="btn btn-xs btn-ghost"
                    style={{ fontSize: "11px", padding: "2px 8px" }}
                    onClick={() => setCaption((c) => c.includes(tag) ? c : `${c.trim()} ${tag}`)}
                  >
                    +{tag}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Media Ingestion URL */}
            <div style={{ marginBottom: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <label className="fieldlabel" style={{ margin: 0 }}>3. Public Video URL (Buffer Media Source)</label>
                <span className="ctl-hint">Accessible link for Buffer's transcriber</span>
              </div>
              <input
                type="text"
                className="cmd-input"
                style={{ width: "100%", padding: "9px 12px", fontSize: "12.5px" }}
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
                placeholder="https://your-public-url.com/clips/..."
              />
              {mediaUrl && (mediaUrl.includes("localhost") || mediaUrl.includes("127.0.0.1") || mediaUrl.includes("0.0.0.0")) && (
                <div style={{ marginTop: "8px", padding: "10px 12px", background: "rgba(245, 158, 11, 0.12)", border: "1px solid rgba(245, 158, 11, 0.35)", borderRadius: "8px", fontSize: "12px", color: "#f59e0b", lineHeight: "1.4" }}>
                  ⚠️ <strong>Buffer needs a public URL:</strong> Buffer is a cloud service and cannot reach your computer at <code>localhost</code>. Run a tunnel (e.g. <code>ngrok http 8000</code>) and set it in Settings under <strong>Public Media Base URL</strong>, or paste any publicly hosted video link.
                </div>
              )}
              <div className="ctl-hint" style={{ marginTop: "4px", fontSize: "11px" }}>
                💡 Buffer fetches and publishes the video directly from this URL.
              </div>
            </div>

            {/* 4. Scheduling Mode */}
            <div style={{ marginBottom: "26px", padding: "16px", background: "var(--surface-2)", borderRadius: "10px", border: "1px solid var(--line)" }}>
              <label className="fieldlabel" style={{ marginBottom: "10px" }}>4. Publishing Schedule</label>
              <div className="toggle" style={{ marginBottom: "14px" }}>
                <button
                  type="button"
                  className={publishMode === "now" ? "active" : ""}
                  onClick={() => setPublishMode("now")}
                >
                  ⚡ Post Immediately
                </button>
                <button
                  type="button"
                  className={publishMode === "schedule" ? "active" : ""}
                  onClick={() => setPublishMode("schedule")}
                >
                  📅 Schedule for Later
                </button>
              </div>

              {publishMode === "schedule" && (
                <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "13px", color: "var(--fg)" }}>Select date &amp; time:</span>
                  <input
                    type="datetime-local"
                    className="cmd-input"
                    style={{ padding: "8px 12px", fontSize: "13px" }}
                    value={scheduleTime}
                    min={new Date().toISOString().slice(0, 16)}
                    onChange={(e) => setScheduleTime(e.target.value)}
                  />
                  <span className="ctl-hint">Buffer will publish automatically at this time.</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-ghost" onClick={onClose} disabled={submitting}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submitting || !selectedIds.length}
                style={{ minWidth: "160px" }}
              >
                {submitting ? (
                  <>
                    <span className="spinner" style={{ width: "14px", height: "14px", marginRight: "6px" }} />
                    Sending to Buffer…
                  </>
                ) : publishMode === "now" ? (
                  "⚡ Publish Now"
                ) : (
                  "📅 Schedule Post"
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
