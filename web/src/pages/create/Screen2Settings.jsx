import { LANGS } from "../../caption.js";
import PhonePreview from "../../components/PhonePreview.jsx";

const ASPECTS = [
  ["9:16", "9:16 Vertical (Shorts/Reels)"],
  ["1:1", "1:1 Square (Feed)"],
  ["16:9", "16:9 Landscape (YouTube)"],
];

function formatDuration(sec) {
  if (!sec || isNaN(sec) || sec <= 0) return null;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}m ${s < 10 ? "0" : ""}${s}s`;
}

export default function Screen2Settings({
  media, sourceReady, prepView, outputAspect, setOutputAspect,
  squareCorners, setSquareCorners, barText, setBarText, barTextColor, setBarTextColor,
  barTextAnim, setBarTextAnim, language, changeLanguage, device, setDevice, devices,
  numClips, setNumClips, clipLen, setClipLen, duration,
  studio, aspect, fit, signature, setSig, videoRef,
  onBack, onNext, nextEnabled,
}) {
  const isSquare = outputAspect === "1:1";
  const formattedDur = formatDuration(duration);
  const targetSec = clipLen || 40;
  const maxPossible = duration ? Math.max(1, Math.floor(duration / targetSec)) : null;

  return (
    <div className="wizard-screen">
      <div className="w3-grid">
        <div className="card w3-left">
          <div className="card-h">
            <div>
              <h2>Clip Strategy & Settings</h2>
              <div className="note" style={{ margin: "2px 0 0 0", fontSize: 13 }}>
                Configure duration, count, and format. ClipForge will find the most viral moments.
              </div>
            </div>
          </div>

          {/* Section 1: Average Clip Length */}
          <div className="settings-section">
            <div className="section-label-row">
              <label className="fieldlabel" style={{ margin: 0 }}>Average Clip Length</label>
              <span className="ctl-hint">Target duration per clip</span>
            </div>
            <div className="clip-len-toggle">
              {[
                ["30s", 30, "Shorts/TikTok"],
                ["45s", 45, "Reels (Ideal)"],
                ["60s", 60, "Longer Story"],
                ["Auto", null, "Adaptive"],
              ].map(([lbl, v, sub]) => (
                <button
                  key={lbl}
                  type="button"
                  className={clipLen === v ? "active" : ""}
                  onClick={() => setClipLen(v)}
                >
                  <span className="btn-main-label">{lbl}</span>
                  <span className="btn-sub-label">{sub}</span>
                </button>
              ))}
              <button
                type="button"
                className={clipLen != null && ![30, 45, 60].includes(clipLen) ? "active" : ""}
                onClick={() => setClipLen((c) => (c != null && ![30, 45, 60].includes(c) ? c : 40))}
              >
                <span className="btn-main-label">Custom</span>
                <span className="btn-sub-label">
                  {clipLen && ![30, 45, 60].includes(clipLen) ? `${clipLen}s` : "Set sec"}
                </span>
              </button>
            </div>

            {clipLen != null && ![30, 45, 60].includes(clipLen) && (
              <div className="custom-len-row" style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
                <span className="ctl-hint">Custom duration:</span>
                <div className="counter" style={{ width: "fit-content" }}>
                  <input
                    type="number"
                    min="10"
                    max="180"
                    value={clipLen}
                    onChange={(e) => setClipLen(Math.max(10, Math.min(180, +e.target.value || 10)))}
                  />
                  <span style={{ padding: "0 10px", opacity: 0.7 }}>seconds</span>
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Number of Clips */}
          <div className="settings-section">
            <div className="section-label-row">
              <label className="fieldlabel" style={{ margin: 0 }}>Number of Clips</label>
              <span className="ctl-hint">How many viral shorts to extract</span>
            </div>

            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
              <div className="toggle" style={{ flex: 1, minWidth: 220 }}>
                {[1, 3, 5, 8].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={numClips === n ? "active" : ""}
                    onClick={() => setNumClips(n)}
                  >
                    {n} {n === 1 ? "Clip" : "Clips"} {n === 3 ? "★" : ""}
                  </button>
                ))}
              </div>
              <div className="counter" style={{ flexShrink: 0 }}>
                <button type="button" onClick={() => setNumClips((n) => Math.max(1, n - 1))}>−</button>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={numClips}
                  onChange={(e) => setNumClips(Math.max(1, Math.min(50, +e.target.value || 1)))}
                />
                <button type="button" onClick={() => setNumClips((n) => Math.min(50, n + 1))}>+</button>
              </div>
            </div>

            {/* Smart Estimator */}
            <div className="smart-estimation-box">
              <div className="estimation-icon">🎯</div>
              <div className="estimation-text">
                {formattedDur ? (
                  <>
                    <strong>Video Length: {formattedDur}</strong>
                    {" · "}
                    <span>
                      Can yield up to <strong>~{maxPossible}</strong> non-overlapping {clipLen ? `${clipLen}s` : "40s"} clips.
                      ClipForge will rank speech density, hooks, and punchlines to export the <strong>top {numClips} viral moments</strong>.
                    </span>
                  </>
                ) : (
                  <>
                    <strong>AI Virality Selection:</strong> ClipForge will score candidate windows by hook keywords, curiosity questions, and natural speech pauses to cut the <strong>top {numClips} viral moments</strong>.
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Section 3: Output Aspect Ratio */}
          <div className="settings-section">
            <label className="fieldlabel">Output Aspect Ratio</label>
            <div className="toggle">
              {ASPECTS.map(([v, l]) => (
                <button key={v} type="button" className={outputAspect === v ? "active" : ""} onClick={() => setOutputAspect(v)}>
                  {l}
                </button>
              ))}
            </div>

            {isSquare && (
              <>
                <label className="fieldlabel" style={{ marginTop: 12 }}>Corners</label>
                <div className="toggle">
                  {["round", "square"].map((c) => (
                    <button key={c} type="button" className={squareCorners === c ? "active" : ""} onClick={() => setSquareCorners(c)}>
                      {c[0].toUpperCase() + c.slice(1)}
                    </button>
                  ))}
                </div>

                <label className="fieldlabel" style={{ marginTop: 12 }}>Title text (top) — Shift+Enter for a new line</label>
                <textarea
                  className="title-area"
                  placeholder="Title shown over the square…&#10;Second line…"
                  rows={2}
                  maxLength={120}
                  value={barText}
                  onChange={(e) => setBarText(e.target.value)}
                />
                <div className="row" style={{ gap: 12, marginTop: 10, alignItems: "center" }}>
                  <label className="swatch">
                    Title colour
                    <input type="color" value={barTextColor} onChange={(e) => setBarTextColor(e.target.value)} />
                  </label>
                  <div style={{ flex: 1 }}>
                    <label className="fieldlabel">Animation</label>
                    <select value={barTextAnim} onChange={(e) => setBarTextAnim(e.target.value)}>
                      <option value="none">None</option>
                      <option value="fade">Fade in</option>
                      <option value="slide">Slide up</option>
                    </select>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Section 4: Engine & Language */}
          <div className="row" style={{ gap: 16, marginTop: 6, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label className="fieldlabel">Caption Language</label>
              <select value={language} onChange={(e) => changeLanguage(e.target.value)}>
                {LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label className="fieldlabel">Processing Mode</label>
              <select value={device} onChange={(e) => setDevice(e.target.value)}>
                {["auto", ...devices.filter((d) => d !== "auto")].filter((v, i, a) => a.indexOf(v) === i).map((d) => (
                  <option key={d} value={d}>{d === "cuda" ? "GPU (CUDA)" : d.toUpperCase()}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="w3-right">
          <PhonePreview
            cfg={studio.cfg}
            cinematic={studio.cinematic}
            language={language}
            media={media}
            preparing={!media && sourceReady}
            aspect={aspect}
            fit={fit}
            barText={barText}
            barTextColor={barTextColor}
            barTextAnim={barTextAnim}
            signature={signature}
            setSig={setSig}
            videoRef={videoRef}
            overrides={studio.overrides}
            setOverride={studio.setOverride}
          />
          <div className={"prep prep-" + (prepView.phase || "idle")}>
            <div className="prep-row">
              <span className="prep-msg">
                {["downloading", "transcribing", "downloaded", "idle"].includes(prepView.phase) && <span className="spinner" />}
                {prepView.phase === "ready" && <span className="prep-ok">✓</span>}
                {prepView.phase === "error" && <span className="prep-ok" style={{ color: "var(--danger)" }}>!</span>}
                {prepView.message || "Preparing video…"}
              </span>
              {prepView.pct != null && <span className="prep-pct">{prepView.pct}%</span>}
            </div>
            <div className="track">
              <div
                className={"fill" + (prepView.pct == null ? " indeterminate" : "")}
                style={prepView.pct == null ? {} : { width: prepView.pct + "%" }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="wizard-nav">
        <button className="btn btn-ghost" type="button" onClick={onBack}>← Back</button>
        <button className="btn btn-primary" type="button" disabled={!nextEnabled} onClick={onNext}>Next →</button>
      </div>
    </div>
  );
}
