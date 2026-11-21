const FONTS = [
  "Roboto",
  "Montserrat",
  "Poppins",
  "Bebas Neue",
  "Anton",
  "Bangers",
  "Luckiest Guy",
  "Oswald",
  "Alfa Slab One",
  "Permanent Marker",
  "Archivo Black",
];

const PRESET_COLORS = [
  "#FFFFFF",
  "#000000",
  "#FFD400",
  "#FF3366",
  "#00E5FF",
  "#76FF03",
];

export default function TextOverlayEditor({ textOverlay, setTextOverlay }) {
  const current = textOverlay || {
    enabled: false,
    text: "WATCH TILL THE END 😱",
    font_family: "Roboto",
    font_size: 52,
    text_color: "#FFFFFF",
    bg_color: "#000000",
    bg_opacity: 80,
    padding: 16,
    border_radius: 12,
    alignment: "center",
    pos_x: 50,
    pos_y: 16,
  };

  const update = (key, val) => {
    setTextOverlay({ ...current, [key]: val });
  };

  return (
    <div className="text-overlay-editor-wrap">
      {/* Enable Toggle */}
      <div className="text-overlay-header-row">
        <div>
          <label className="fieldlabel" style={{ margin: 0 }}>Fixed Text Overlay</label>
          <div className="ctl-hint">Headline / hook text displayed permanently over the video</div>
        </div>
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={current.enabled}
            onChange={(e) => update("enabled", e.target.checked)}
          />
          <span className="slider round" />
        </label>
      </div>

      {current.enabled && (
        <div className="text-overlay-fields">
          {/* Text Content */}
          <div className="form-group" style={{ marginTop: 14 }}>
            <label className="fieldlabel">Overlay Text</label>
            <textarea
              className="title-area"
              rows={2}
              maxLength={150}
              placeholder="e.g. PART 1: The Untold Story…&#10;WAIT TILL THE END!"
              value={current.text}
              onChange={(e) => update("text", e.target.value)}
            />
          </div>

          {/* Typography */}
          <div className="row" style={{ gap: 14, marginTop: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label className="fieldlabel">Font Family</label>
              <select
                value={current.font_family}
                onChange={(e) => update("font_family", e.target.value)}
              >
                {FONTS.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>

            <div style={{ width: 140 }}>
              <label className="fieldlabel">Size: {current.font_size || 52}px</label>
              <input
                type="range"
                min="18"
                max="140"
                value={current.font_size || 52}
                onChange={(e) => update("font_size", +e.target.value)}
                className="range"
              />
            </div>
          </div>

          {/* Colors & Opacity */}
          <div className="row" style={{ gap: 14, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <label className="fieldlabel">Text Color</label>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="color"
                  value={current.text_color}
                  onChange={(e) => update("text_color", e.target.value)}
                  className="swatch-color-input"
                />
                {PRESET_COLORS.map((c) => (
                  <div
                    key={c}
                    className={`mini-color-dot ${current.text_color.toUpperCase() === c ? "active" : ""}`}
                    style={{ background: c }}
                    onClick={() => update("text_color", c)}
                  />
                ))}
              </div>
            </div>

            <div>
              <label className="fieldlabel">Background Color</label>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="color"
                  value={current.bg_color}
                  onChange={(e) => update("bg_color", e.target.value)}
                  className="swatch-color-input"
                />
                <span className="ctl-hint" style={{ fontSize: 11 }}>
                  Opacity: {Math.round(current.bg_opacity)}%
                </span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={current.bg_opacity}
                  onChange={(e) => update("bg_opacity", +e.target.value)}
                  className="range"
                  style={{ width: 70 }}
                />
              </div>
            </div>
          </div>

          {/* Padding & Corner Roundedness */}
          <div className="row" style={{ gap: 14, marginTop: 14, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label className="fieldlabel">Box Padding: {current.padding}px</label>
              <input
                type="range"
                min="4"
                max="36"
                value={current.padding}
                onChange={(e) => update("padding", +e.target.value)}
                className="range"
              />
            </div>

            <div style={{ flex: 1, minWidth: 140 }}>
              <label className="fieldlabel">Corner Radius: {current.border_radius}px</label>
              <input
                type="range"
                min="0"
                max="36"
                value={current.border_radius}
                onChange={(e) => update("border_radius", +e.target.value)}
                className="range"
              />
            </div>
          </div>

          {/* Alignment & Position */}
          <div className="row" style={{ gap: 14, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <label className="fieldlabel">Alignment</label>
              <div className="toggle">
                {["left", "center", "right"].map((align) => (
                  <button
                    key={align}
                    type="button"
                    className={current.alignment === align ? "active" : ""}
                    onClick={() => update("alignment", align)}
                  >
                    {align[0].toUpperCase() + align.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ flex: 1, minWidth: 180 }}>
              <label className="fieldlabel">Vertical Position ({Math.round(current.pos_y)}%)</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => update("pos_y", 14)}
                >
                  Top
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => update("pos_y", 50)}
                >
                  Center
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => update("pos_y", 84)}
                >
                  Bottom
                </button>
                <input
                  type="range"
                  min="5"
                  max="95"
                  value={current.pos_y}
                  onChange={(e) => update("pos_y", +e.target.value)}
                  className="range"
                  style={{ flex: 1 }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
