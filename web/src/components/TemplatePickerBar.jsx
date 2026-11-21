export default function TemplatePickerBar({
  templates,
  activeTemplateId,
  onApplyTemplate,
  onOpenSave,
}) {
  if (!templates || !templates.length) return null;

  return (
    <div className="template-picker-strip">
      <div className="tpl-strip-left">
        <span className="tpl-strip-icon">⭐</span>
        <span className="tpl-strip-label">Project Template:</span>
      </div>
      <div className="tpl-strip-chips">
        {templates.map((tpl) => {
          const isActive = activeTemplateId === tpl.id;
          const mode = tpl.framing?.mode || "solo";
          return (
            <button
              key={tpl.id}
              type="button"
              className={`tpl-strip-chip ${isActive ? "active" : ""}`}
              onClick={() => onApplyTemplate(tpl)}
              title={tpl.description || tpl.name}
            >
              <span className="tpl-chip-name">{tpl.name}</span>
              <span className="tpl-chip-mode">{mode}</span>
            </button>
          );
        })}
      </div>
      {onOpenSave && (
        <button
          type="button"
          className="tpl-strip-save-btn"
          onClick={onOpenSave}
          title="Save current project setup as a new template"
        >
          💾 Save Current
        </button>
      )}
    </div>
  );
}
