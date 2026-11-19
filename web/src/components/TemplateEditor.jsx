import { useRef } from "react";

const TEMPLATES = [
  { id: "none", label: "None", desc: "Clean full-frame output without social wrappers" },
  { id: "twitter", label: "Twitter / X", desc: "Tweet card with avatar, handle, verified badge & text" },
  { id: "instagram", label: "Instagram", desc: "Reels / Post header with avatar, audio tag & engagement bar" },
  { id: "news", label: "Breaking News", desc: "TV broadcast lower-third chyron with LIVE ticker badge" },
  { id: "custom", label: "Custom Banner", desc: "Upload your own branded PNG/JPG background frame" },
];

export default function TemplateEditor({ templateConfig, setTemplateConfig }) {
  const avatarInputRef = useRef(null);
  const bannerInputRef = useRef(null);

  const current = templateConfig || {
    preset: "none",
    avatar_url: null,
    display_name: "Alex Rivera",
    username: "alexrivera",
    verified: true,
    caption_text: "You won't believe what happened next… Thread 👇",
    video_scale: 100,
    video_pos_y: 50,
    custom_banner_url: null,
  };

  const update = (key, val) => {
    setTemplateConfig({ ...current, [key]: val });
  };

  const handleAvatarUpload = (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      const url = URL.createObjectURL(file);
      update("avatar_url", url);
    }
  };

  const handleBannerUpload = (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      const url = URL.createObjectURL(file);
      update("custom_banner_url", url);
    }
  };

  return (
    <div className="template-editor-wrap">
      {/* Preset Cards Selection */}
      <div className="template-cards-grid">
        {TEMPLATES.map((t) => (
          <div
            key={t.id}
            className={`template-preset-card ${current.preset === t.id ? "active" : ""}`}
            onClick={() => update("preset", t.id)}
          >
            <div className="template-card-title">{t.label}</div>
            <div className="template-card-desc">{t.desc}</div>
          </div>
        ))}
      </div>

      {current.preset !== "none" && (
        <div className="template-details-section">
          {/* Video Scaling & Position Inside Template */}
          <div className="template-scale-box">
            <div className="section-label-row">
              <label className="fieldlabel" style={{ margin: 0 }}>Video Size Inside Template</label>
              <span className="ctl-hint">Scale &amp; fit the clipped video inside the card</span>
            </div>
            <div className="row" style={{ gap: 16, alignItems: "center", marginTop: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span className="ctl-hint">Video Zoom / Scale:</span>
                  <strong>{Math.round(current.video_scale)}%</strong>
                </div>
                <input
                  type="range"
                  min="50"
                  max="140"
                  value={current.video_scale}
                  onChange={(e) => update("video_scale", +e.target.value)}
                  className="range"
                />
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span className="ctl-hint">Vertical Position:</span>
                  <strong>{Math.round(current.video_pos_y)}%</strong>
                </div>
                <input
                  type="range"
                  min="20"
                  max="80"
                  value={current.video_pos_y}
                  onChange={(e) => update("video_pos_y", +e.target.value)}
                  className="range"
                />
              </div>
            </div>
          </div>

          {/* Twitter / X Specific Fields */}
          {current.preset === "twitter" && (
            <div className="template-social-fields">
              <div className="row" style={{ gap: 14, alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    className="avatar-preview-circle"
                    onClick={() => avatarInputRef.current?.click()}
                    title="Click to upload custom avatar"
                  >
                    {current.avatar_url ? (
                      <img src={current.avatar_url} alt="Avatar" />
                    ) : (
                      <span>👤</span>
                    )}
                  </div>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={handleAvatarUpload}
                  />
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => avatarInputRef.current?.click()}
                  >
                    Upload Avatar
                  </button>
                </div>

                <label className="checkbox-row" style={{ marginLeft: "auto" }}>
                  <input
                    type="checkbox"
                    checked={current.verified}
                    onChange={(e) => update("verified", e.target.checked)}
                  />
                  <span>Verified Blue Badge</span>
                </label>
              </div>

              <div className="row" style={{ gap: 12, marginTop: 12 }}>
                <div style={{ flex: 1 }}>
                  <label className="fieldlabel">Display Name</label>
                  <input
                    type="text"
                    value={current.display_name}
                    onChange={(e) => update("display_name", e.target.value)}
                    placeholder="e.g. Alex Rivera"
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="fieldlabel">Handle (@)</label>
                  <input
                    type="text"
                    value={current.username}
                    onChange={(e) => update("username", e.target.value)}
                    placeholder="e.g. alexrivera"
                  />
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <label className="fieldlabel">Tweet Text</label>
                <textarea
                  className="title-area"
                  rows={2}
                  value={current.caption_text}
                  onChange={(e) => update("caption_text", e.target.value)}
                  placeholder="The tweet caption above your video…"
                />
              </div>
            </div>
          )}

          {/* Instagram Specific Fields */}
          {current.preset === "instagram" && (
            <div className="template-social-fields">
              <div className="row" style={{ gap: 12, alignItems: "center" }}>
                <div
                  className="avatar-preview-circle insta-ring"
                  onClick={() => avatarInputRef.current?.click()}
                  title="Click to upload avatar"
                >
                  {current.avatar_url ? (
                    <img src={current.avatar_url} alt="Avatar" />
                  ) : (
                    <span>📸</span>
                  )}
                </div>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={handleAvatarUpload}
                />
                <div style={{ flex: 1 }}>
                  <label className="fieldlabel">Account Username</label>
                  <input
                    type="text"
                    value={current.username}
                    onChange={(e) => update("username", e.target.value)}
                    placeholder="e.g. creative.media"
                  />
                </div>
              </div>
            </div>
          )}

          {/* News Specific Fields */}
          {current.preset === "news" && (
            <div className="template-social-fields">
              <div>
                <label className="fieldlabel">Breaking News Headline Ticker</label>
                <textarea
                  className="title-area"
                  rows={2}
                  value={current.caption_text || "BREAKING: Global announcement made today live on air"}
                  onChange={(e) => update("caption_text", e.target.value)}
                  placeholder="Headline displayed on the lower-third TV chyron…"
                />
              </div>
            </div>
          )}

          {/* Custom Banner Upload */}
          {current.preset === "custom" && (
            <div className="template-social-fields">
              <label className="fieldlabel">Upload Custom Background Image</label>
              <div className="custom-banner-uploader">
                <input
                  ref={bannerInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={handleBannerUpload}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => bannerInputRef.current?.click()}
                >
                  Choose Background Image
                </button>
                {current.custom_banner_url && (
                  <span className="ctl-hint" style={{ color: "var(--ok)" }}>✓ Custom background loaded</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
