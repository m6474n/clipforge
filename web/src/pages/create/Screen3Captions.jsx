import { useState } from "react";
import { captionLineStyle, effectiveCfg } from "../../caption.js";
import Customizer from "../../components/Customizer.jsx";
import PhonePreview from "../../components/PhonePreview.jsx";
import Transcript from "../../components/Transcript.jsx";
import { Icons } from "../../components/Icons.jsx";

function Chip({ label, cfg, active, trending, custom, onClick, onDelete }) {
  const words = (label || "Aa").split(/\s+/).slice(0, 2);
  const style = captionLineStyle(cfg, { fontPx: 16, scale: 0.16 });
  const hl = (cfg.animation === "highlight" || cfg.karaoke) ? words.length - 1 : -1;
  return (
    <button type="button" className={"chip" + (active ? " active" : "")} onClick={onClick}>
      {custom ? <span className="tag custom">Custom</span> : trending ? <span className="tag">Trending</span> : null}
      {custom && <span className="chip-del" onClick={(e) => { e.stopPropagation(); onDelete(); }}>✕</span>}
      <span className="stage"><span className="sample" style={style}>
        {words.map((w, i) => <span key={i} style={{ color: i === hl ? (cfg.highlight_color || "#FFD400") : undefined }}>{w} </span>)}
      </span></span>
      <span className="name">{label}</span>
    </button>
  );
}

function SaveBlock({ s, open, setOpen }) {
  const [name, setName] = useState("");
  const commit = () => { if (s.saveCurrentPreset(name)) { setOpen(false); setName(""); } };
  if (!open) return null;
  return (
    <div className="save-form">
      <input type="text" placeholder="Name your style…" value={name} maxLength={40} autoFocus
        onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setOpen(false); }} />
      <button className="btn btn-primary" onClick={commit}>Save</button>
      <button className="btn" onClick={() => setOpen(false)}>✕</button>
    </div>
  );
}

function CaptionPlacementBar({ studio }) {
  const s = studio;
  const px = s.cfg?.pos_x != null ? s.cfg.pos_x : 50;
  const py = s.cfg?.pos_y != null ? s.cfg.pos_y : 88;

  const isTop = Math.abs(px - 50) <= 2 && Math.abs(py - 14) <= 4;
  const isCenter = Math.abs(px - 50) <= 2 && Math.abs(py - 50) <= 4;
  const isBottom = Math.abs(px - 50) <= 2 && Math.abs(py - 88) <= 4;

  const setPos = (x, y) => {
    s.setOverride("pos_x", x);
    s.setOverride("pos_y", y);
  };

  return (
    <div className="caption-pos-card">
      <div className="caption-pos-header">
        <div className="caption-pos-title">
          <span className="caption-pos-icon">📍</span>
          <span>Caption Placement</span>
        </div>
        <span className="caption-pos-coords">X: {px}% · Y: {py}%</span>
      </div>

      {/* Quick Placement Buttons */}
      <div className="caption-pos-btn-group">
        <button
          type="button"
          className={"caption-pos-btn" + (isTop ? " active" : "")}
          onClick={() => setPos(50, 14)}
          title="Place captions near the top (14%)"
        >
          <span className="pos-btn-icon">⬆️</span>
          <span>Top</span>
          <span className="pos-btn-badge">14%</span>
        </button>
        <button
          type="button"
          className={"caption-pos-btn" + (isCenter ? " active" : "")}
          onClick={() => setPos(50, 50)}
          title="Place captions in the center (50%)"
        >
          <span className="pos-btn-icon">⏺️</span>
          <span>Center</span>
          <span className="pos-btn-badge">50%</span>
        </button>
        <button
          type="button"
          className={"caption-pos-btn" + (isBottom ? " active" : "")}
          onClick={() => setPos(50, 88)}
          title="Place captions near the bottom (88%)"
        >
          <span className="pos-btn-icon">⬇️</span>
          <span>Bottom</span>
          <span className="pos-btn-badge">88%</span>
        </button>
      </div>

      {/* Sliders for precise manual tuning */}
      <div className="caption-pos-sliders">
        <div className="caption-pos-slider-row">
          <label className="caption-slider-lbl">
            <span>Vertical (Y)</span>
            <span className="slider-val">{py}%</span>
          </label>
          <input
            type="range"
            min="6"
            max="94"
            value={py}
            onChange={(e) => s.setOverride("pos_y", Number(e.target.value))}
            className="range"
          />
        </div>
        <div className="caption-pos-slider-row">
          <label className="caption-slider-lbl">
            <span>Horizontal (X)</span>
            <span className="slider-val">{px}%</span>
          </label>
          <input
            type="range"
            min="10"
            max="90"
            value={px}
            onChange={(e) => s.setOverride("pos_x", Number(e.target.value))}
            className="range"
          />
        </div>
      </div>
      <div className="caption-pos-hint">
        💡 Tip: You can also drag the caption directly on the phone preview.
      </div>
    </div>
  );
}

// Screen 3 — Transcription & Caption Styles. Transcription already started in
// the background the moment Screen 2 was entered (usePrep); this screen just
// surfaces its progress alongside the full style picker (built-in themes,
// live customizer, and saveable custom presets — unchanged from before).
export default function Screen3Captions({
  studio, language, onFontUpload, media, prepView, sourceReady,
  transcript, curTime, seekTo, videoRef, aspect, fit, barText, barTextColor, barTextAnim, signature, setSig,
  framing, setFraming, textOverlay, setTextOverlay, templateConfig,
  onBack, onNext,
}) {
  const [tab, setTab] = useState("themes");
  const [saveOpen, setSaveOpen] = useState(false);
  const s = studio;
  const trending = s.presets.filter((p) => p.trending);
  const standard = s.presets.filter((p) => !p.trending);

  return (
    <div className="wizard-screen">
      <div className="w3-grid">
        <div className="card w3-left">
          <div className="card-h"><h2>Caption style</h2></div>
          <div className="studio-tabs">
            <button className={"studio-tab" + (tab === "themes" ? " active" : "")} onClick={() => setTab("themes")}><Icons.library /><span className="studio-tab-lbl">Themes</span></button>
            <button className={"studio-tab" + (tab === "style" ? " active" : "")} onClick={() => setTab("style")}><Icons.create /><span className="studio-tab-lbl">Customize</span></button>
            <button className={"studio-tab" + (tab === "presets" ? " active" : "")} onClick={() => setTab("presets")}><Icons.download /><span className="studio-tab-lbl">My presets</span></button>
            <button className={"studio-tab" + (tab === "transcript" ? " active" : "")} onClick={() => setTab("transcript")}><Icons.bolt /><span className="studio-tab-lbl">Transcript</span></button>
          </div>

          {tab !== "transcript" && <CaptionPlacementBar studio={s} />}

          {tab === "themes" && (
            <div className="studio-pane">
              <div className="chips">
                {trending.map((p) => <Chip key={p.id} label={p.label} trending cfg={p} active={s.activeKey === p.id} onClick={() => s.selectPreset(p.id)} />)}
                {standard.map((p) => <Chip key={p.id} label={p.label} cfg={p} active={s.activeKey === p.id} onClick={() => s.selectPreset(p.id)} />)}
              </div>
            </div>
          )}

          {tab === "style" && (
            <div className="studio-pane">
              <div className="style-head">
                <span className="eyebrow">Customize</span>
                <button className="save-btn" onClick={() => setSaveOpen((v) => !v)}><Icons.download /> Save current</button>
              </div>
              <SaveBlock s={s} open={saveOpen} setOpen={setSaveOpen} />
              <Customizer studio={s} onFontUpload={onFontUpload} />
            </div>
          )}

          {tab === "presets" && (
            <div className="studio-pane">
              <div className="style-head">
                <span className="eyebrow">My styles</span>
                <button className="save-btn" onClick={() => setSaveOpen((v) => !v)}><Icons.download /> Save current</button>
              </div>
              <SaveBlock s={s} open={saveOpen} setOpen={setSaveOpen} />
              <div className="chips">
                {s.userPresets.map((up) => (
                  <Chip key={up.id} label={up.label} custom active={s.activeKey === up.id}
                    cfg={effectiveCfg(s.presets, up.base, up.overrides)}
                    onClick={() => s.selectUserPreset(up)} onDelete={() => s.removeUserPreset(up.id)} />
                ))}
                {!s.userPresets.length && (
                  <div className="empty" style={{ gridColumn: "1/-1", padding: 24 }}>No saved styles yet — tune a look in <b>Customize</b> and hit “Save current”.</div>
                )}
              </div>
            </div>
          )}

          {tab === "transcript" && (
            <div className="studio-pane">
              <Transcript state={transcript} onSeek={seekTo} currentTime={curTime} />
            </div>
          )}
        </div>

        <div className="w3-right">
          <PhonePreview cfg={studio.cfg} cinematic={studio.cinematic} language={language} media={media}
            preparing={!media && sourceReady} aspect={aspect} fit={fit} barText={barText}
            barTextColor={barTextColor} barTextAnim={barTextAnim}
            signature={signature} setSig={setSig} videoRef={videoRef}
            overrides={studio.overrides} setOverride={studio.setOverride}
            framing={framing} setFraming={setFraming} textOverlay={textOverlay} setTextOverlay={setTextOverlay} templateConfig={templateConfig} />
          <div className={"prep prep-" + (prepView.phase || "idle")}>
            <div className="prep-row" style={{ alignItems: "center" }}>
              <span className="prep-msg" style={{ flex: 1, minWidth: 0 }}>
                {["downloading", "transcribing", "downloaded", "idle"].includes(prepView.phase) && <span className="spinner" />}
                {prepView.phase === "ready" && <span className="prep-ok">✓</span>}
                {prepView.phase === "error" && <span className="prep-ok" style={{ color: "var(--danger)" }}>!</span>}
                {prepView.message || "Preparing video…"}
              </span>
              {prepView.phase === "ready" && !prepView.transcriptReady && prepView.onManualTranscribe && (
                <button
                  type="button"
                  className="btn btn-xs"
                  style={{ marginLeft: 8, flexShrink: 0, padding: "2px 8px", fontSize: 11 }}
                  onClick={prepView.onManualTranscribe}
                  title="Run local Whisper AI speech transcription"
                >
                  🎙️ Transcribe Now
                </button>
              )}
              {prepView.pct != null && <span className="prep-pct">{prepView.pct}%</span>}
            </div>
            <div className="track"><div className={"fill" + (prepView.pct == null ? " indeterminate" : "")} style={prepView.pct == null ? {} : { width: prepView.pct + "%" }} /></div>
          </div>
        </div>
      </div>

      <div className="wizard-nav">
        <button className="btn btn-ghost" onClick={onBack}>← Back</button>
        <button className="btn btn-primary" onClick={onNext}>Next →</button>
      </div>
    </div>
  );
}
