import { useEffect, useState } from "react";
import { api } from "../api.js";
import { LANGS } from "../caption.js";
import ModelOnboarding from "../components/ModelOnboarding.jsx";

export default function Settings() {
  const [d, setD] = useState(null);
  const [modelInfo, setModelInfo] = useState(null);
  const [showModelModal, setShowModelModal] = useState(false);
  const [autoTranscribe, setAutoTranscribe] = useState(() => {
    return localStorage.getItem("cf_auto_transcribe") !== "false";
  });
  const [savingConfig, setSavingConfig] = useState(false);

  // Clipping & Generation Defaults
  const [defaultNumClips, setDefaultNumClips] = useState(() => {
    return +localStorage.getItem("cf_default_num_clips") || 1;
  });
  const [defaultClipLen, setDefaultClipLen] = useState(() => {
    return localStorage.getItem("cf_default_clip_len") || "full";
  });
  const [defaultAspect, setDefaultAspect] = useState(() => {
    return localStorage.getItem("cf_default_aspect") || "9:16";
  });
  const [defaultLanguage, setDefaultLanguage] = useState(() => {
    return localStorage.getItem("cf_default_lang") || "auto";
  });
  const [defaultDevice, setDefaultDevice] = useState(() => {
    return localStorage.getItem("cf_default_device") || "auto";
  });

  const updateDefaultNumClips = (val) => {
    const n = Math.max(1, +val || 1);
    setDefaultNumClips(n);
    localStorage.setItem("cf_default_num_clips", n);
  };

  const updateDefaultClipLen = (val) => {
    setDefaultClipLen(val);
    localStorage.setItem("cf_default_clip_len", val);
  };

  const updateDefaultAspect = (val) => {
    setDefaultAspect(val);
    localStorage.setItem("cf_default_aspect", val);
  };

  const updateDefaultLanguage = (val) => {
    setDefaultLanguage(val);
    localStorage.setItem("cf_default_lang", val);
  };

  const updateDefaultDevice = (val) => {
    setDefaultDevice(val);
    localStorage.setItem("cf_default_device", val);
  };

  // Buffer.com Integration state
  const [bufferStatus, setBufferStatus] = useState(null);
  const [bufferToken, setBufferToken] = useState("");
  const [publicBaseUrl, setPublicBaseUrl] = useState("");
  const [bufferProfiles, setBufferProfiles] = useState([]);
  const [savingBuffer, setSavingBuffer] = useState(false);
  const [bufferMsg, setBufferMsg] = useState(null);

  const loadData = () => {
    api.devices().then(setD).catch(() => setD({ devices: [], cuda_available: false }));
    api.systemAndModels().then((info) => {
      setModelInfo(info);
      if (info && info.auto_transcribe !== undefined) {
        setAutoTranscribe(info.auto_transcribe);
        localStorage.setItem("cf_auto_transcribe", info.auto_transcribe);
      }
    }).catch(() => {});
    api.bufferStatus().then((st) => {
      setBufferStatus(st);
      if (st.public_base_url) setPublicBaseUrl(st.public_base_url);
      if (st.configured && st.ok) {
        api.bufferProfiles().then((p) => setBufferProfiles(Array.isArray(p) ? p : [])).catch(() => {});
      }
    }).catch(() => {});
  };

  const handleSaveBuffer = async (e) => {
    e.preventDefault();
    setSavingBuffer(true);
    setBufferMsg(null);
    try {
      const payload = { public_base_url: publicBaseUrl };
      if (bufferToken.trim()) payload.access_token = bufferToken.trim();
      const updated = await api.bufferSaveConfig(payload);
      setBufferStatus(updated);
      if (updated.ok) {
        setBufferMsg({ type: "ok", text: `✓ Connected as ${updated.user?.name || updated.user?.email || "Buffer user"}` });
        const p = await api.bufferProfiles();
        setBufferProfiles(Array.isArray(p) ? p : []);
        setBufferToken(""); // clear token input after save
      } else {
        setBufferMsg({ type: "err", text: updated.error || "Could not connect to Buffer." });
      }
    } catch (err) {
      setBufferMsg({ type: "err", text: err.message || "Failed to update Buffer config." });
    } finally {
      setSavingBuffer(false);
    }
  };

  const handleToggleAutoTranscribe = async (val) => {
    setAutoTranscribe(val);
    localStorage.setItem("cf_auto_transcribe", val);
    setSavingConfig(true);
    try {
      await api.updateConfig({ auto_transcribe: val });
    } catch (err) {
      console.error("Failed to save config:", err);
    } finally {
      setSavingConfig(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const activeModelObj = modelInfo?.models?.find(
    (m) => m.id === (modelInfo.selected_model || modelInfo.active_model)
  );

  return (
    <>
      {/* Clipping & Video Defaults Card */}
      <div className="card" style={{ maxWidth: 660, marginBottom: 20 }}>
        <div className="card-h">
          <div>
            <h2 style={{ margin: 0 }}>Clipping &amp; Video Defaults</h2>
            <div className="note" style={{ margin: "3px 0 0 0", fontSize: 12.5 }}>
              Configure defaults for all tools (AI Clipper, Reframer, Captions) so the runtime flow stays fast and streamlined.
            </div>
          </div>
        </div>

        {/* Default Number of Clips */}
        <div style={{ padding: "14px 0", borderBottom: "1px solid var(--line)" }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div>
              <div style={{ fontWeight: 600 }}>Default Number of Clips</div>
              <div className="note" style={{ margin: "2px 0 0 0", fontSize: 12 }}>
                Default is 1 clip (full video). Choose more clips if you want AI viral moment extraction.
              </div>
            </div>
            <div className="counter" style={{ flexShrink: 0 }}>
              <button type="button" onClick={() => updateDefaultNumClips(defaultNumClips - 1)}>−</button>
              <input
                type="number"
                min="1"
                max="20"
                value={defaultNumClips}
                onChange={(e) => updateDefaultNumClips(e.target.value)}
              />
              <button type="button" onClick={() => updateDefaultNumClips(defaultNumClips + 1)}>+</button>
            </div>
          </div>
          <div className="toggle" style={{ marginTop: 6 }}>
            {[
              [1, "1 Clip (Full Video) ★"],
              [2, "2 Clips"],
              [3, "3 Clips"],
              [5, "5 Clips"],
            ].map(([n, lbl]) => (
              <button
                key={n}
                type="button"
                className={defaultNumClips === n ? "active" : ""}
                onClick={() => updateDefaultNumClips(n)}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>

        {/* Default Clip Duration */}
        <div style={{ padding: "14px 0", borderBottom: "1px solid var(--line)" }}>
          <div style={{ fontWeight: 600 }}>Default Clip Duration</div>
          <div className="note" style={{ margin: "2px 0 8px 0", fontSize: 12 }}>
            Duration per clip. "Full Video" retains the complete video duration without cuts.
          </div>
          <div className="toggle" style={{ flexWrap: "wrap", gap: 6 }}>
            {[
              ["full", "Full Video (Default)"],
              ["30", "30s (Shorts)"],
              ["45", "45s (Reels)"],
              ["60", "60s (Stories)"],
              ["auto", "Auto (Adaptive)"],
            ].map(([val, lbl]) => (
              <button
                key={val}
                type="button"
                className={String(defaultClipLen) === String(val) ? "active" : ""}
                onClick={() => updateDefaultClipLen(val)}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>

        {/* Default Aspect Ratio */}
        <div style={{ padding: "14px 0", borderBottom: "1px solid var(--line)" }}>
          <div style={{ fontWeight: 600 }}>Default Aspect Ratio</div>
          <div className="note" style={{ margin: "2px 0 8px 0", fontSize: 12 }}>
            Preferred export format for reframing and clipping.
          </div>
          <div className="toggle">
            {[
              ["9:16", "9:16 Vertical (Shorts/Reels)"],
              ["1:1", "1:1 Square (Feed)"],
              ["16:9", "16:9 Landscape (YouTube)"],
            ].map(([val, lbl]) => (
              <button
                key={val}
                type="button"
                className={defaultAspect === val ? "active" : ""}
                onClick={() => updateDefaultAspect(val)}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>

        {/* Default Language & Processing Mode */}
        <div className="row" style={{ gap: 16, paddingTop: 14, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label className="fieldlabel">Default Caption Language</label>
            <select
              value={defaultLanguage}
              onChange={(e) => updateDefaultLanguage(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--line-2)", color: "var(--text)" }}
            >
              {LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label className="fieldlabel">Default Processing Device</label>
            <select
              value={defaultDevice}
              onChange={(e) => updateDefaultDevice(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--line-2)", color: "var(--text)" }}
            >
              <option value="auto">Auto (Detect Fastest)</option>
              <option value="cuda">GPU (CUDA)</option>
              <option value="cpu">CPU</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 660 }}>
        <div className="card-h"><h2>Speech Recognition & Hardware</h2></div>
        {!d ? <div className="note">Checking…</div> : (
          <>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: "1px solid var(--line)" }}>
              <div style={{ paddingRight: 16 }}>
                <div style={{ fontWeight: 600 }}>Auto-Transcribe Videos</div>
                <div className="note" style={{ margin: "2px 0 0 0", fontSize: 12 }}>
                  Automatically run Whisper speech transcription in the background when importing a video.
                  Turn off to save CPU/GPU and transcribe only on demand.
                </div>
              </div>
              <label className="toggle-switch" style={{ flexShrink: 0 }}>
                <input
                  type="checkbox"
                  checked={autoTranscribe}
                  onChange={(e) => handleToggleAutoTranscribe(e.target.checked)}
                />
                <span className="slider round" />
              </label>
            </div>

            <div className="row" style={{ justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
              <div>
                <div style={{ fontWeight: 600 }}>Active Whisper Model</div>
                <div className="note" style={{ margin: "2px 0 0 0", fontSize: 12 }}>
                  {activeModelObj ? `${activeModelObj.name} (${activeModelObj.size_label}) — ${activeModelObj.tagline}` : (d.model_size || "—")}
                </div>
              </div>
              <button className="btn btn-sm" onClick={() => setShowModelModal(true)}>
                Change Model
              </button>
            </div>

            <div className="row" style={{ justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
              <span className="note" style={{ margin: 0 }}>GPU (CUDA)</span>
              <b>{d.cuda_available ? (d.gpu_name || "Available") : "Not available"}</b>
            </div>
            <div className="row" style={{ justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
              <span className="note" style={{ margin: 0 }}>Active device</span>
              <b>{(d.default || "—").toUpperCase()}</b>
            </div>
            <div className="row" style={{ justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
              <span className="note" style={{ margin: 0 }}>Available Devices</span>
              <b>{(d.devices || []).map((x) => x.toUpperCase()).join(" · ") || "—"}</b>
            </div>
            {modelInfo?.system && (
              <div className="row" style={{ justifyContent: "space-between", padding: "10px 0" }}>
                <span className="note" style={{ margin: 0 }}>Detected System</span>
                <span style={{ fontSize: 13, color: "var(--muted)" }}>
                  {modelInfo.system.cpu} ({modelInfo.system.ram_gb} GB RAM)
                </span>
              </div>
            )}
            <div className="note" style={{ marginTop: 16 }}>
              Everything runs locally — yt-dlp downloads, faster-whisper transcribes, and ffmpeg renders.
              No video or audio leaves this machine.
            </div>
          </>
        )}
      </div>

      {/* Buffer.com Social Scheduling Card */}
      <div className="card" style={{ maxWidth: 620, marginTop: 20 }}>
        <div className="card-h">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>🚀</span>
            <div>
              <h2 style={{ margin: 0 }}>Buffer.com Social Scheduling &amp; MCP</h2>
              <div className="note" style={{ margin: "2px 0 0 0", fontSize: 12 }}>
                Connect your Buffer account to 1-click publish and schedule shorts to TikTok, Reels, Shorts &amp; X.
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSaveBuffer} style={{ marginTop: 14 }}>
          {bufferMsg && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                fontSize: 13,
                marginBottom: 14,
                background: bufferMsg.type === "ok" ? "rgba(182, 255, 46, 0.1)" : "rgba(239, 68, 68, 0.15)",
                border: `1px solid ${bufferMsg.type === "ok" ? "var(--accent)" : "var(--danger)"}`,
                color: bufferMsg.type === "ok" ? "var(--accent)" : "var(--danger)",
              }}
            >
              {bufferMsg.text}
            </div>
          )}

          {/* Connection status banner */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", background: "var(--surface-2)", borderRadius: 10, border: "1px solid var(--line)", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>
                {bufferStatus?.configured && bufferStatus?.ok ? "🟢 Buffer Connected" : "⚪ Not Connected"}
              </div>
              <div className="ctl-hint">
                {bufferStatus?.configured && bufferStatus?.ok
                  ? `${bufferStatus.user?.name || bufferStatus.user?.email} (${bufferProfiles.length} active channels)`
                  : "Add your Buffer API Access Token below to connect."}
              </div>
            </div>
            <a
              href="https://buffer.com/developers/apps"
              target="_blank"
              rel="noreferrer"
              className="btn btn-xs btn-ghost"
              style={{ fontSize: 11 }}
            >
              Get Token ↗
            </a>
          </div>

          {/* Connected Channels List */}
          {bufferProfiles.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <label className="fieldlabel" style={{ fontSize: 12, marginBottom: 8 }}>Connected Channels</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {bufferProfiles.map((p) => (
                  <span
                    key={p.id}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "4px 10px",
                      background: "var(--surface-2)",
                      borderRadius: 8,
                      border: "1px solid var(--line)",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    <span>{p.service === "tiktok" ? "🎵" : p.service === "instagram" ? "📸" : p.service === "youtube" ? "▶️" : p.service === "twitter" ? "𝕏" : "🌐"}</span>
                    <span>{p.username}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Token Input */}
          <div style={{ marginBottom: 14 }}>
            <label className="fieldlabel">Buffer Access Token</label>
            <input
              type="password"
              className="cmd-input"
              style={{ width: "100%", padding: "10px 12px", fontSize: 13 }}
              placeholder={bufferStatus?.configured ? "•••••••••••••••••••••••• (saved — leave blank to keep)" : "Paste your Buffer Access Token…"}
              value={bufferToken}
              onChange={(e) => setBufferToken(e.target.value)}
            />
          </div>

          {/* Public Base URL */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <label className="fieldlabel" style={{ margin: 0 }}>Public Media Base URL (Optional)</label>
              <span className="ctl-hint">For local tunneling (e.g. ngrok / Cloudflare)</span>
            </div>
            <input
              type="text"
              className="cmd-input"
              style={{ width: "100%", padding: "10px 12px", fontSize: 13 }}
              placeholder="e.g. https://abc1234.ngrok-free.app"
              value={publicBaseUrl}
              onChange={(e) => setPublicBaseUrl(e.target.value)}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={savingBuffer}
          >
            {savingBuffer ? "Saving & Testing…" : "Save & Verify Connection"}
          </button>
        </form>
      </div>

      {showModelModal && (
        <ModelOnboarding
          isModal={true}
          currentModel={modelInfo?.selected_model || modelInfo?.active_model}
          onClose={() => setShowModelModal(false)}
          onSelect={() => {
            setShowModelModal(false);
            loadData();
          }}
        />
      )}
    </>
  );
}
