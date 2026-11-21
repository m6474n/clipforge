import { useEffect, useRef, useState } from "react";
import { captionLineStyle, captionSample, CINE_GRADE_CSS } from "../caption.js";

function smoothstep(f) { return f * f * (3 - 2 * f); }
function scrimGradient(strengthPct, side) {
  const m = Math.max(0, Math.min(1, (strengthPct || 0) / 100));
  const stops = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const eased = side === "top" ? 1 - smoothstep(f) : smoothstep(f);
    return `rgba(0,0,0,${(m * eased).toFixed(3)}) ${f * 100}%`;
  });
  return `linear-gradient(to bottom, ${stops.join(", ")})`;
}

function hexToRgba(hex, alpha = 1) {
  if (!hex || hex[0] !== "#") return `rgba(0,0,0,${alpha})`;
  let c = hex.slice(1);
  if (c.length === 3) c = c.split("").map((x) => x + x).join("");
  const num = parseInt(c, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function regions(aspect, fit) {
  if (fit === "square") return { box: { left: "2.78%", top: "28.2%", width: "94.4%", height: "43.6%", borderRadius: "14px" }, top: 28.2, height: 43.6 };
  if (aspect === "16:9") return { box: { left: 0, right: 0, top: "37%", height: "26%" }, top: 37, height: 26 };
  return { box: { left: 0, right: 0, top: "8.97%", height: "82.05%" }, top: 8.97, height: 82.05 };
}

function CaptionLine({ cfg, language, fontPx, scale }) {
  const samp = captionSample(language);
  const anim = cfg.karaoke ? "karaoke" : (cfg.animation || "none");
  const [i, setI] = useState(0);
  useEffect(() => {
    if (anim === "none") { setI(0); return; }
    const n = samp.words.length;
    const t = setInterval(() => setI((x) => (x + 1) % n), anim === "one_word" ? 620 : 520);
    return () => clearInterval(t);
  }, [anim, samp.words.length]);

  const base = cfg.primary_color || "#fff";
  const hi = cfg.highlight_color || "#FFD400";
  const style = captionLineStyle(cfg, { fontPx, scale });
  return (
    <span className="cap-line" style={style}>
      {samp.words.map((w, k) => {
        let color, opacity = 1, transform = "none", display = "inline";
        if (anim === "highlight") color = k === i ? hi : base;
        else if (anim === "karaoke") color = k <= i ? hi : base;
        else if (anim === "word_reveal") { opacity = k <= i ? 1 : 0; transform = k <= i ? "scale(1)" : "scale(.7)"; }
        else if (anim === "one_word") display = k === i ? "inline" : "none";
        else if (cfg.animation === "highlight" && k === samp.hl) color = hi;
        return <span key={k} style={{ color, opacity, transform, display, transition: "color .18s, opacity .25s, transform .25s" }}>{w} </span>;
      })}
    </span>
  );
}

function getEmbedSrc(src, muted = true) {
  if (!src) return "";
  const sep = src.includes("?") ? "&" : "?";
  if (src.includes("youtube.com/embed/")) {
    return `${src}${sep}autoplay=1&mute=${muted ? "1" : "0"}&controls=0&loop=1`;
  }
  return src;
}

function FramedMedia({ media, frame, videoRef, autoPlay = true, muted = true, loop = true, isMaster = false }) {
  const containerRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [videoAR, setVideoAR] = useState(16 / 9);
  const vidRef = useRef(null);

  // Measure cell container size dynamically
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setSize({ w: rect.width, h: rect.height });
      }
    };
    updateSize();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(updateSize);
      ro.observe(el);
      return () => ro.disconnect();
    }
  }, []);

  // Sync playback with master videoRef if available
  useEffect(() => {
    const master = videoRef?.current;
    const slave = vidRef.current;
    if (!master || !slave || master === slave) return;

    const syncTime = () => {
      if (Math.abs(slave.currentTime - master.currentTime) > 0.25) {
        slave.currentTime = master.currentTime;
      }
    };
    const syncPlay = () => slave.play().catch(() => {});
    const syncPause = () => slave.pause();

    master.addEventListener("timeupdate", syncTime);
    master.addEventListener("play", syncPlay);
    master.addEventListener("pause", syncPause);
    if (!master.paused) slave.play().catch(() => {});

    return () => {
      master.removeEventListener("timeupdate", syncTime);
      master.removeEventListener("play", syncPlay);
      master.removeEventListener("pause", syncPause);
    };
  }, [videoRef]);

  if (!media) return null;

  // Fallback dimensions if container not yet measured
  const cellW = size.w || 224;
  const cellH = size.h || 199;

  const f = frame || { x: 0, y: 0, width: 100, height: 100 };
  const fx = Math.max(0, Math.min(100, f.x || 0)) / 100;
  const fy = Math.max(0, Math.min(100, f.y || 0)) / 100;
  const fw = Math.max(0.05, Math.min(1, (f.width || 100) / 100));
  const fh = Math.max(0.05, Math.min(1, (f.height || 100) / 100));

  // Compute exact pixel dimensions maintaining video aspect ratio without distortion
  const boxAR = (fw / fh) * videoAR;
  const cellAR = cellW / Math.max(1, cellH);

  let vidW, vidH, left, top;

  if (boxAR >= cellAR) {
    // Crop box is wider than cell -> match height, cover width
    vidH = cellH / fh;
    vidW = vidH * videoAR;
    const boxW = fw * vidW;
    top = -fy * vidH;
    left = -fx * vidW + (cellW - boxW) / 2;
  } else {
    // Crop box is taller than cell -> match width, cover height
    vidW = cellW / fw;
    vidH = vidW / videoAR;
    const boxH = fh * vidH;
    left = -fx * vidW;
    top = -fy * vidH + (cellH - boxH) / 2;
  }

  const mediaStyle = {
    position: "absolute",
    left: `${Math.round(left)}px`,
    top: `${Math.round(top)}px`,
    width: `${Math.round(vidW)}px`,
    height: `${Math.round(vidH)}px`,
    maxWidth: "none",
    maxHeight: "none",
    objectFit: "cover",
    border: 0,
    pointerEvents: "none",
    display: "block",
  };

  const handleRef = (el) => {
    vidRef.current = el;
    if (isMaster && videoRef) {
      if (typeof videoRef === "function") videoRef(el);
      else videoRef.current = el;
    }
  };

  return (
    <div ref={containerRef} className="framed-cell-container" style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden" }}>
      {media.kind === "embed" ? (
        <iframe
          className="framed-media-element"
          src={getEmbedSrc(media.src, muted)}
          style={mediaStyle}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <video
          ref={handleRef}
          className="framed-media-element"
          src={media.src}
          muted={muted}
          loop={loop}
          autoPlay={autoPlay}
          playsInline
          style={mediaStyle}
          onLoadedMetadata={(e) => {
            if (e.target.videoWidth && e.target.videoHeight) {
              setVideoAR(e.target.videoWidth / e.target.videoHeight);
            }
          }}
        />
      )}
    </div>
  );
}

export default function PhonePreview({
  cfg, cinematic, language, media, preparing, aspect, fit,
  barText, barTextColor, barTextAnim, signature, setSig, setOverride, videoRef,
  framing, textOverlay, templateConfig,
}) {
  const screenRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [screenW, setScreenW] = useState(224);
  const reg = regions(aspect, fit);

  useEffect(() => {
    const el = screenRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setScreenW(el.clientWidth));
    ro.observe(el); setScreenW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  function sigDown(e) {
    if (!setSig) return;
    e.preventDefault(); e.stopPropagation();
    const move = (ev) => {
      const r = screenRef.current.getBoundingClientRect();
      const p = ev.touches ? ev.touches[0] : ev;
      const px = Math.max(0, Math.min(100, ((p.clientX - r.left) / r.width) * 100));
      const py = Math.max(0, Math.min(100, ((p.clientY - r.top) / r.height) * 100));
      setSig("pos_x", Math.round(px)); setSig("pos_y", Math.round(py));
    };
    const up = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
    document.addEventListener("mousemove", move); document.addEventListener("mouseup", up);
  }

  const free = cfg.pos_x != null && cfg.pos_y != null;
  const yFrac = free ? cfg.pos_y / 100 : ({ top: 0.12, center: 0.5, bottom: 0.88 }[cfg.position || "bottom"]);
  const x = free ? cfg.pos_x : 50;
  const squareBelow = fit === "square" && !free;
  const y = squareBelow ? (reg.top + reg.height + 2) : (reg.top + yFrac * reg.height);

  function onDown(e) {
    e.preventDefault();
    setDragging(true);
    const move = (ev) => {
      const r = screenRef.current.getBoundingClientRect();
      const p = ev.touches ? ev.touches[0] : ev;
      let px = ((p.clientX - r.left) / r.width) * 100;
      let py = (((p.clientY - r.top) / r.height) * 100 - reg.top) / reg.height * 100;
      px = Math.max(4, Math.min(96, px)); py = Math.max(2, Math.min(98, py));
      const snap = (v, ts, th) => { for (const t of ts) if (Math.abs(v - t) < th) return t; return v; };
      px = snap(px, [50], 4.5); py = snap(py, [12, 50, 88], 5.5);
      setOverride("pos_x", Math.round(px * 10) / 10);
      setOverride("pos_y", Math.round(py * 10) / 10);
    };
    const up = () => { setDragging(false); document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
    document.addEventListener("mousemove", move); document.addEventListener("mouseup", up);
  }

  const c = cinematic || {};
  const mediaFilter = (() => {
    let f = CINE_GRADE_CSS[c.color_grade] || "";
    if (c.glow) { const g = 1 + (c.glow_strength || 0) / 100 * 0.12; f += ` brightness(${g.toFixed(3)}) contrast(1.03)`; }
    return f.trim();
  })();
  const barH = c.letterbox ? 5 + (c.letterbox_size || 50) / 100 * 9 : 0;
  const fontPx = Math.max(11, (cfg.font_size || 90) * (cfg.font_scale || 1) * (reg.height / 82.05) * 0.16);

  // Template config
  const tpl = templateConfig || { preset: "none" };
  const hasTemplate = tpl.preset && tpl.preset !== "none";
  const videoScale = hasTemplate ? (tpl.video_scale || 100) / 100 : 1;

  // Multi-frame layout calculation
  const framesList = framing?.frames && framing.frames.length > 0 ? framing.frames : [];
  const isMultiFrame = (framing?.mode && framing.mode !== "solo") || framesList.length > 1;
  const layoutMode = framing?.mode && framing.mode !== "solo"
    ? framing.mode
    : framesList.length === 2
    ? "duo"
    : framesList.length === 3
    ? "triple"
    : framesList.length >= 4
    ? "quad"
    : "solo";

  return (
    <div className="phone">
      <div ref={screenRef} className={"phone-screen" + (!media ? " empty" : "")}>
        <div className="island" />
        <div className="preview-pill"><span className="dot" />Preview</div>

        {/* Custom Banner Background if selected */}
        {tpl.preset === "custom" && tpl.custom_banner_url && (
          <img src={tpl.custom_banner_url} alt="Custom Background" className="template-custom-bg" />
        )}

        {/* Twitter / X Template Wrapper Header */}
        {tpl.preset === "twitter" && (
          <div className="preview-twitter-card">
            <div className="preview-tw-header">
              <div className="preview-tw-avatar">
                {tpl.avatar_url ? <img src={tpl.avatar_url} alt="avatar" /> : <span>👤</span>}
              </div>
              <div className="preview-tw-meta">
                <div className="preview-tw-name">
                  {tpl.display_name || "Creator"}
                  {tpl.verified && (
                    <svg className="preview-tw-badge" viewBox="0 0 24 24" fill="#1D9BF0">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                    </svg>
                  )}
                </div>
                <div className="preview-tw-handle">@{tpl.username || "creator"}</div>
              </div>
            </div>
            {tpl.caption_text && <div className="preview-tw-text">{tpl.caption_text}</div>}
          </div>
        )}

        {/* Instagram Template Wrapper Header */}
        {tpl.preset === "instagram" && (
          <div className="preview-insta-header">
            <div className="preview-insta-avatar">
              {tpl.avatar_url ? <img src={tpl.avatar_url} alt="avatar" /> : <span>📸</span>}
            </div>
            <div className="preview-insta-name">{tpl.username || "creator"}</div>
            <div className="preview-insta-more">•••</div>
          </div>
        )}

        {/* Main Media Box */}
        <div
          className={`media-box ${isMultiFrame ? "is-split-layout" : ""}`}
          style={{
            ...reg.box,
            filter: mediaFilter,
            transform: hasTemplate ? `scale(${videoScale})` : "none",
            transformOrigin: "center center",
            position: "absolute",
            overflow: "hidden",
          }}
        >
          {media && (media.kind === "video" || media.kind === "embed") ? (
            isMultiFrame && framesList.length > 1 ? (
              <div className={`split-frames-grid mode-${layoutMode}`}>
                {framesList.map((f, i) => (
                  <div key={i} className="split-frame-cell">
                    <FramedMedia
                      media={media}
                      frame={f}
                      videoRef={videoRef}
                      isMaster={i === 0}
                    />
                    <div className="split-cell-tag">Frame {i + 1}</div>
                  </div>
                ))}
              </div>
            ) : (
              <FramedMedia
                media={media}
                frame={framesList[0]}
                videoRef={videoRef}
                isMaster={true}
              />
            )
          ) : (
            <div className="media-ph">
              {preparing
                ? <><span className="spinner" /> Preparing preview…</>
                : media?.kind === "unknown"
                  ? "Can't embed this link — it'll still render"
                  : "Add a video to preview"}
            </div>
          )}

          {/* Cinematic overlay */}
          {c.bottom_gradient && <div className="ov" style={{ left: 0, right: 0, bottom: 0, height: (c.bottom_gradient_height || 25) + "%", background: scrimGradient(c.bottom_gradient_strength, "bottom") }} />}
          {c.top_gradient && <div className="ov" style={{ left: 0, right: 0, top: 0, height: (c.top_gradient_height || 20) + "%", background: scrimGradient(c.top_gradient_strength, "top") }} />}
          {c.vignette && <div className="ov" style={{ inset: 0, background: `radial-gradient(ellipse 75% 75% at 50% 50%, rgba(0,0,0,0) 45%, rgba(0,0,0,${((c.vignette_strength || 0) / 100 * 0.9).toFixed(3)}) 115%)` }} />}
          {c.letterbox && <>
            <div className="ov" style={{ left: 0, right: 0, top: 0, height: barH + "%", background: "#000" }} />
            <div className="ov" style={{ left: 0, right: 0, bottom: 0, height: barH + "%", background: "#000" }} />
          </>}
        </div>

        {/* Breaking News Chyron */}
        {tpl.preset === "news" && (
          <div className="preview-news-chyron">
            <div className="preview-news-badge">🔴 BREAKING NEWS</div>
            <div className="preview-news-text">{tpl.caption_text || "LIVE: Special announcement broadcast"}</div>
          </div>
        )}

        {/* Instagram Engagement Bar */}
        {tpl.preset === "instagram" && (
          <div className="preview-insta-footer">
            <span>❤️</span>
            <span>💬</span>
            <span>↗️</span>
            <span style={{ marginLeft: "auto" }}>🔖</span>
          </div>
        )}

        {/* Fixed Text Overlay */}
        {textOverlay && textOverlay.enabled && (textOverlay.text || "").trim() && (
          <div
            className="preview-fixed-text-overlay"
            style={{
              left: `${textOverlay.pos_x || 50}%`,
              top: `${textOverlay.pos_y || 16}%`,
              transform: "translate(-50%, -50%)",
              fontFamily: textOverlay.font_family || "Roboto-Bold",
              fontSize: `${Math.max(9, (textOverlay.font_size || 34) * (screenW / 1080))}px`,
              color: textOverlay.text_color || "#FFFFFF",
              backgroundColor: hexToRgba(textOverlay.bg_color || "#000000", (textOverlay.bg_opacity != null ? textOverlay.bg_opacity : 75) / 100),
              padding: `${(textOverlay.padding || 14) * 0.35}px ${(textOverlay.padding || 14) * 0.55}px`,
              borderRadius: `${(textOverlay.border_radius || 12) * 0.4}px`,
              textAlign: textOverlay.alignment || "center",
            }}
          >
            {textOverlay.text}
          </div>
        )}

        {/* Square Title Header */}
        {fit === "square" && barText && (
          <div
            key={barText + barTextAnim}
            className={"frame-title" + (barTextAnim === "fade" ? " ft-fade" : barTextAnim === "slide" ? " ft-slide" : "")}
            style={{ top: "22%", whiteSpace: "pre-line", color: barTextColor || "#fff" }}
          >
            {barText}
          </div>
        )}

        {/* Captions Preview */}
        <div className={"cap-preview" + (dragging ? " dragging" : "")}
          style={{ left: x + "%", top: y + "%", transform: `translate(-50%, ${squareBelow ? "0" : "-50%"})`, right: "auto", bottom: "auto", maxWidth: "92%" }}>
          <span className="cap-line-wrap" onMouseDown={onDown} onTouchStart={onDown}>
            <CaptionLine cfg={cfg} language={language} fontPx={fontPx} scale={0.16} />
          </span>
        </div>

        {/* Watermark Signature */}
        {signature?.enabled && (signature.text || "").trim() && (
          <div className="sig-preview" onMouseDown={sigDown}
            style={{
              left: (signature.pos_x != null ? signature.pos_x : 50) + "%",
              top: (signature.pos_y != null ? signature.pos_y : 92) + "%",
              transform: `translate(${-(signature.pos_x != null ? signature.pos_x : 50)}%, ${-(signature.pos_y != null ? signature.pos_y : 92)}%)`,
              color: signature.color || "#fff",
              opacity: (signature.opacity != null ? signature.opacity : 75) / 100,
              fontSize: Math.max(7, (signature.size != null ? signature.size : 34) * screenW / 1080) + "px",
            }}>
            {signature.text}
          </div>
        )}
      </div>
    </div>
  );
}
