import { useState } from "react";
import { LANGS } from "../../caption.js";
import PhonePreview from "../../components/PhonePreview.jsx";
import FramingEditor from "../../components/FramingEditor.jsx";
import TextOverlayEditor from "../../components/TextOverlayEditor.jsx";
import TemplateEditor from "../../components/TemplateEditor.jsx";
import SavedTemplatesManager from "../../components/SavedTemplatesManager.jsx";
import TemplatePickerBar from "../../components/TemplatePickerBar.jsx";

const ASPECTS = [
  ["9:16", "9:16 Vertical (Shorts/Reels)"],
  ["1:1", "1:1 Square (Feed)"],
  ["16:9", "16:9 Landscape (YouTube)"],
];

const TABS = [
  { id: "framing", label: "📐 Framing & Aspect" },
  { id: "saved_templates", label: "⭐ Presets" },
  { id: "text", label: "✍️ Text Overlay" },
  { id: "templates", label: "🎨 Social Cards" },
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
  framing, setFraming, textOverlay, setTextOverlay, templateConfig, setTemplateConfig,
  studio, aspect, fit, signature, setSig, videoRef,
  templates, activeTemplateId, onApplyTemplate, onSaveTemplate, onDeleteTemplate,
  onBack, onNext, nextEnabled, nextLabel, activeToolId,
}) {
  const [activeTab, setActiveTab] = useState("framing");
  const isSquare = outputAspect === "1:1";
  const formattedDur = formatDuration(duration);
  const targetSec = clipLen || 40;
  const maxPossible = duration ? Math.max(1, Math.floor(duration / targetSec)) : null;

  const isReframeOnly = activeToolId === "reframe";

  return (
    <div className="wizard-screen">
      <div className="w3-grid">
        <div className="card w3-left">
          <div className="card-h">
            <div>
              <h2>{isReframeOnly ? "Video Reframer" : "Clip Studio & Layout"}</h2>
              <div className="note" style={{ margin: "2px 0 0 0", fontSize: 13 }}>
                {isReframeOnly
                  ? "Choose target aspect ratio, adjust crop position, and export directly."
                  : "Customize visual framing, aspect ratio, headline overlays, and social templates."}
              </div>
            </div>
          </div>

          {!isReframeOnly && (
            <>
              {/* Quick Template Strip */}
              <div style={{ padding: "0 16px 12px" }}>
                <TemplatePickerBar
                  templates={templates}
                  activeTemplateId={activeTemplateId}
                  onApplyTemplate={onApplyTemplate}
                  onOpenSave={() => setActiveTab("saved_templates")}
                />
              </div>

              {/* Sub-Tabs Navigation */}
              <div className="screen2-subtabs">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`subtab-btn ${activeTab === t.id ? "active" : ""}`}
                    onClick={() => setActiveTab(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Framing & Aspect (Always shown for reframe tool, or when framing tab active) */}
          {(isReframeOnly || activeTab === "framing") && (
            <div className="tab-pane-content">
              {/* Output Aspect Ratio */}
              <div className="settings-section" style={{ marginBottom: 14 }}>
                <label className="fieldlabel">Output Aspect Ratio</label>
                <div className="toggle">
                  {ASPECTS.map(([v, l]) => (
                    <button key={v} type="button" className={outputAspect === v ? "active" : ""} onClick={() => setOutputAspect(v)}>
                      {l}
                    </button>
                  ))}
                </div>

                {isSquare && (
                  <div style={{ marginTop: 10 }}>
                    <label className="fieldlabel">Corners</label>
                    <div className="toggle">
                      {["round", "square"].map((c) => (
                        <button key={c} type="button" className={squareCorners === c ? "active" : ""} onClick={() => setSquareCorners(c)}>
                          {c[0].toUpperCase() + c.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <FramingEditor
                media={media}
                framing={framing}
                setFraming={setFraming}
                videoRef={videoRef}
              />
            </div>
          )}

          {!isReframeOnly && (
            <>
              {/* TAB 0: Saved Templates */}
              {activeTab === "saved_templates" && (
                <div className="tab-pane-content">
                  <SavedTemplatesManager
                    templates={templates}
                    activeTemplateId={activeTemplateId}
                    onApplyTemplate={onApplyTemplate}
                    onSaveTemplate={onSaveTemplate}
                    onDeleteTemplate={onDeleteTemplate}
                    currentSummary={{
                      framingMode: framing?.mode,
                      splitPct: framing?.split_pct,
                      captionPreset: studio.activeKey,
                      captionPos: `${studio.cfg?.pos_x ?? 50}% / ${studio.cfg?.pos_y ?? 88}%`,
                      hasOverlay: textOverlay?.enabled,
                      aspect: outputAspect,
                    }}
                  />
                </div>
              )}

              {/* TAB 2: Fixed Text Overlay */}
              {activeTab === "text" && (
                <div className="tab-pane-content">
                  <TextOverlayEditor
                    textOverlay={textOverlay}
                    setTextOverlay={setTextOverlay}
                  />
                </div>
              )}

              {/* TAB 3: Background Templates */}
              {activeTab === "templates" && (
                <div className="tab-pane-content">
                  <TemplateEditor
                    templateConfig={templateConfig}
                    setTemplateConfig={setTemplateConfig}
                  />
                </div>
              )}
            </>
          )}
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
            framing={framing}
            setFraming={setFraming}
            textOverlay={textOverlay}
            setTextOverlay={setTextOverlay}
            templateConfig={templateConfig}
          />
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
        <button className="btn btn-primary" type="button" disabled={!nextEnabled} onClick={onNext}>{nextLabel || "Next →"}</button>
      </div>
    </div>
  );
}
