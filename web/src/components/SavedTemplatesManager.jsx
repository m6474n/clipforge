import { useState } from "react";
import { Icons } from "./Icons.jsx";

export default function SavedTemplatesManager({
  templates,
  activeTemplateId,
  onApplyTemplate,
  onSaveTemplate,
  onDeleteTemplate,
  currentSummary,
}) {
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSaveTemplate(name.trim(), desc.trim());
      setName("");
      setDesc("");
      setSaveOpen(false);
      showToast("Template saved successfully!");
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleApply = (tpl) => {
    onApplyTemplate(tpl);
    showToast(`Applied "${tpl.name}"!`);
  };

  return (
    <div className="saved-templates-manager">
      {/* Header with Save Button */}
      <div className="stm-header">
        <div>
          <h3 className="stm-title">Saved Project Templates</h3>
          <p className="stm-subtitle">
            Save and reuse your custom framing layouts, screen splits, caption styles, positions, and text overlays across multiple videos.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary stm-save-trigger"
          onClick={() => setSaveOpen((v) => !v)}
        >
          <Icons.download />
          <span>{saveOpen ? "Cancel" : "Save Current as Template"}</span>
        </button>
      </div>

      {toast && <div className="stm-toast">✓ {toast}</div>}

      {/* Save Template Form */}
      {saveOpen && (
        <form className="stm-save-card" onSubmit={handleSave}>
          <div className="stm-save-head">
            <span className="stm-save-badge">New Template</span>
            <span className="stm-save-hint">Saves all framing, captions, and overlay settings</span>
          </div>

          <div className="stm-form-row">
            <div className="stm-field" style={{ flex: 1.2 }}>
              <label className="fieldlabel">Template Name *</label>
              <input
                type="text"
                placeholder="e.g. Gaming Duo Split 50/50, Podcast Reaction…"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={50}
                required
                autoFocus
              />
            </div>
            <div className="stm-field" style={{ flex: 2 }}>
              <label className="fieldlabel">Description (optional)</label>
              <input
                type="text"
                placeholder="e.g. Top facecam, bottom gameplay with bold yellow captions"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                maxLength={100}
              />
            </div>
          </div>

          {currentSummary && (
            <div className="stm-current-summary">
              <span className="summary-title">Will bundle current configuration:</span>
              <div className="summary-tags">
                <span className="summary-tag">📐 {currentSummary.framingMode || "Solo"} mode ({currentSummary.splitPct || 50}% split)</span>
                <span className="summary-tag">💬 {currentSummary.captionPreset || "Alex Bold"} ({currentSummary.captionPos || "Center"})</span>
                {currentSummary.hasOverlay && <span className="summary-tag">✍️ Text overlay enabled</span>}
                <span className="summary-tag">📱 {currentSummary.aspect || "9:16"}</span>
              </div>
            </div>
          )}

          <div className="stm-actions">
            <button type="submit" className="btn btn-primary" disabled={saving || !name.trim()}>
              {saving ? "Saving…" : "Save Template"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setSaveOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Template Cards Grid */}
      <div className="stm-grid">
        {(Array.isArray(templates) ? templates : []).map((tpl) => {
          const isActive = activeTemplateId === tpl.id;
          const mode = tpl.framing?.mode || "solo";
          const split = tpl.framing?.split_pct || 50;
          const capStyle = tpl.caption?.preset || "default";
          const capY = tpl.caption?.pos_y != null ? `${tpl.caption.pos_y}%` : "88%";

          return (
            <div key={tpl.id} className={`stm-card ${isActive ? "is-active" : ""}`}>
              <div className="stm-card-top">
                <div className="stm-card-meta">
                  <div className="stm-card-name-row">
                    <span className="stm-card-name">{tpl.name}</span>
                    {isActive && <span className="stm-active-pill">Active</span>}
                    {tpl.is_default && <span className="stm-default-pill">Built-in</span>}
                  </div>
                  {tpl.description && <div className="stm-card-desc">{tpl.description}</div>}
                </div>
                {!tpl.is_default && onDeleteTemplate && (
                  <button
                    type="button"
                    className="stm-del-btn"
                    onClick={() => onDeleteTemplate(tpl.id)}
                    title="Delete template"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Badges / Specs */}
              <div className="stm-card-specs">
                <span className="spec-badge">
                  📐 <b>{mode.toUpperCase()}</b> {mode === "duo" ? `(${split}/${100 - split})` : ""}
                </span>
                <span className="spec-badge">
                  💬 <b>{String(capStyle || "default").replace("_", " ")}</b> ({capY})
                </span>
                {tpl.text_overlay?.enabled && (
                  <span className="spec-badge">
                    ✍️ <b>{tpl.text_overlay.font_family || "Overlay"}</b>
                  </span>
                )}
                <span className="spec-badge">
                  📱 <b>{tpl.output?.aspect || "9:16"}</b>
                </span>
              </div>

              {/* Apply Button */}
              <div className="stm-card-foot">
                <button
                  type="button"
                  className={`btn ${isActive ? "btn-secondary" : "btn-primary"} stm-apply-btn`}
                  onClick={() => handleApply(tpl)}
                >
                  {isActive ? "✓ Applied to Project" : "Apply Template"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
