import { useEffect, useRef, useState } from "react";

const RATIOS = [
  { id: "1:1", label: "1:1", ratio: 1 / 1 },
  { id: "9:16", label: "9:16", ratio: 9 / 16 },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
  { id: "4:5", label: "4:5", ratio: 4 / 5 },
  { id: "3:4", label: "3:4", ratio: 3 / 4 },
  { id: "custom", label: "Custom", ratio: null },
];

const LAYOUTS = [
  { id: "solo", label: "Solo", frames: 1, desc: "Single speaker focus" },
  { id: "duo", label: "Duo", frames: 2, desc: "2-speaker split (podcast / interview)" },
  { id: "triple", label: "Triple", frames: 3, desc: "3 speakers / reaction layout" },
  { id: "quad", label: "Quad", frames: 4, desc: "4 speakers / panel grid" },
];

function defaultFramesFor(mode, ratioId) {
  const r = RATIOS.find((x) => x.id === ratioId)?.ratio || (9 / 16);
  // Source video assumed 16:9 landscape normalized coordinate space [0, 100]
  if (mode === "solo") {
    // 1 frame centered
    const h = 90;
    const w = ratioId === "custom" ? 60 : Math.min(95, h * (r / (16 / 9)));
    return [{ x: (100 - w) / 2, y: (100 - h) / 2, width: w, height: h, aspect_ratio: ratioId }];
  }
  if (mode === "duo") {
    // 2 frames side-by-side or stacked
    const h = 80;
    const w = ratioId === "custom" ? 42 : Math.min(46, h * (r / (16 / 9)));
    return [
      { x: 10, y: (100 - h) / 2, width: w, height: h, aspect_ratio: ratioId },
      { x: 100 - 10 - w, y: (100 - h) / 2, width: w, height: h, aspect_ratio: ratioId },
    ];
  }
  if (mode === "triple") {
    // 1 host left, 2 guests stacked right
    const h = 75;
    const w = 38;
    return [
      { x: 6, y: 12, width: w, height: h, aspect_ratio: ratioId },
      { x: 54, y: 8, width: 38, height: 38, aspect_ratio: ratioId },
      { x: 54, y: 52, width: 38, height: 38, aspect_ratio: ratioId },
    ];
  }
  // Quad: 2x2 grid
  const w = 38;
  const h = 38;
  return [
    { x: 8, y: 8, width: w, height: h, aspect_ratio: ratioId },
    { x: 54, y: 8, width: w, height: h, aspect_ratio: ratioId },
    { x: 8, y: 54, width: w, height: h, aspect_ratio: ratioId },
    { x: 54, y: 54, width: w, height: h, aspect_ratio: ratioId },
  ];
}

export default function FramingEditor({ media, framing, setFraming, videoRef }) {
  const containerRef = useRef(null);
  const localVideoRef = useRef(null);
  const [activeFrameIdx, setActiveFrameIdx] = useState(0);
  const [dragState, setDragState] = useState(null); // { type: 'move'|'resize', corner, startX, startY, origFrame }

  // Video playback & scrubbing state
  const [playing, setPlaying] = useState(false);
  const [curTime, setCurTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(true);

  const handleVideoRef = (el) => {
    localVideoRef.current = el;
    if (videoRef) {
      if (typeof videoRef === "function") videoRef(el);
      else videoRef.current = el;
    }
  };

  const togglePlay = () => {
    const v = localVideoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().then(() => setPlaying(true)).catch((err) => console.warn("Video play error:", err));
    } else {
      v.pause();
      setPlaying(false);
    }
  };

  const seek = (time) => {
    const v = localVideoRef.current;
    if (!v) return;
    const t = Math.max(0, Math.min(duration || 0, time));
    v.currentTime = t;
    setCurTime(t);
  };

  const stepTime = (delta) => {
    const v = localVideoRef.current;
    if (!v) return;
    seek(v.currentTime + delta);
  };

  const toggleMute = () => {
    const v = localVideoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const fmtTime = (sec) => {
    if (!sec || isNaN(sec) || sec < 0) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const mode = framing?.mode || "solo";
  const frames = framing?.frames && framing.frames.length > 0 ? framing.frames : defaultFramesFor("solo", "9:16");
  const activeFrame = frames[activeFrameIdx] || frames[0] || { x: 25, y: 10, width: 50, height: 80, aspect_ratio: "9:16" };
  const currentRatioId = activeFrame.aspect_ratio || "9:16";

  const handleModeChange = (newMode) => {
    const newFrames = defaultFramesFor(newMode, currentRatioId);
    setFraming({ mode: newMode, frames: newFrames });
    setActiveFrameIdx(0);
  };

  const handleRatioChange = (newRatioId) => {
    const updated = frames.map((f, idx) => {
      if (idx !== activeFrameIdx && mode !== "solo") return f;
      const r = RATIOS.find((x) => x.id === newRatioId)?.ratio;
      let w = f.width;
      let h = f.height;
      if (r) {
        // Adjust width to match ratio with current height, clamped
        w = Math.max(10, Math.min(100, h * (r / (16 / 9))));
        if (f.x + w > 100) f.x = Math.max(0, 100 - w);
      }
      return { ...f, width: w, height: h, aspect_ratio: newRatioId };
    });
    setFraming({ mode, frames: updated });
  };

  // Mouse & Touch interaction for Drag / Resize
  const startDrag = (e, idx, type, corner = null) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveFrameIdx(idx);
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);
    setDragState({
      type,
      corner,
      startX: clientX,
      startY: clientY,
      origFrame: { ...frames[idx] },
      frameIdx: idx,
    });
  };

  useEffect(() => {
    if (!dragState) return;

    const onMove = (e) => {
      const clientX = e.clientX || (e.touches && e.touches[0].clientX);
      const clientY = e.clientY || (e.touches && e.touches[0].clientY);
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const deltaXPct = ((clientX - dragState.startX) / rect.width) * 100;
      const deltaYPct = ((clientY - dragState.startY) / rect.height) * 100;
      const orig = dragState.origFrame;
      const ratioObj = RATIOS.find((r) => r.id === orig.aspect_ratio);
      const lockedRatio = ratioObj ? ratioObj.ratio : null;

      let newX = orig.x;
      let newY = orig.y;
      let newW = orig.width;
      let newH = orig.height;

      if (dragState.type === "move") {
        newX = Math.max(0, Math.min(100 - orig.width, orig.x + deltaXPct));
        newY = Math.max(0, Math.min(100 - orig.height, orig.y + deltaYPct));
      } else if (dragState.type === "resize") {
        const c = dragState.corner;
        // Corner resizing
        if (c.includes("r")) newW = Math.max(10, Math.min(100 - orig.x, orig.width + deltaXPct));
        if (c.includes("b")) newH = Math.max(10, Math.min(100 - orig.y, orig.height + deltaYPct));
        if (c.includes("l")) {
          const clampedDelta = Math.max(-orig.x, Math.min(orig.width - 10, deltaXPct));
          newX = orig.x + clampedDelta;
          newW = orig.width - clampedDelta;
        }
        if (c.includes("t")) {
          const clampedDelta = Math.max(-orig.y, Math.min(orig.height - 10, deltaYPct));
          newY = orig.y + clampedDelta;
          newH = orig.height - clampedDelta;
        }

        // Apply aspect ratio lock if not custom
        if (lockedRatio) {
          // Adjust height based on width in 16:9 canvas space
          newH = Math.max(10, Math.min(100 - newY, newW / (lockedRatio / (16 / 9))));
        }
      }

      const updated = frames.map((f, i) =>
        i === dragState.frameIdx ? { ...f, x: Math.round(newX * 10) / 10, y: Math.round(newY * 10) / 10, width: Math.round(newW * 10) / 10, height: Math.round(newH * 10) / 10 } : f
      );
      setFraming({ mode, frames: updated });
    };

    const onUp = () => setDragState(null);

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove);
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
  }, [dragState, frames, mode, setFraming]);

  return (
    <div className="framing-editor-wrap">
      {/* Top Layout & Mode Switcher */}
      <div className="framing-ctrl-bar">
        <div>
          <label className="fieldlabel" style={{ margin: "0 0 6px 0" }}>Frame Layout</label>
          <div className="toggle framing-mode-toggle">
            {LAYOUTS.map((l) => (
              <button
                key={l.id}
                type="button"
                className={mode === l.id ? "active" : ""}
                onClick={() => handleModeChange(l.id)}
                title={l.desc}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="fieldlabel" style={{ margin: "0 0 6px 0" }}>Aspect Ratio Lock</label>
          <div className="toggle framing-ratio-toggle">
            {RATIOS.map((r) => (
              <button
                key={r.id}
                type="button"
                className={currentRatioId === r.id ? "active" : ""}
                onClick={() => handleRatioChange(r.id)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Frame selector chips if multi-frame */}
      {frames.length > 1 && (
        <div className="multi-frame-chips">
          <span className="ctl-hint" style={{ marginRight: 6 }}>Editing frame:</span>
          {frames.map((_, i) => (
            <button
              key={i}
              type="button"
              className={`frame-chip ${activeFrameIdx === i ? "active" : ""}`}
              onClick={() => setActiveFrameIdx(i)}
            >
              Frame {i + 1}
            </button>
          ))}
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            style={{ marginLeft: "auto", fontSize: 11 }}
            onClick={() => setFraming({ mode, frames: defaultFramesFor(mode, currentRatioId) })}
          >
            Reset Positions
          </button>
        </div>
      )}

      {/* Interactive Video Crop Stage */}
      <div
        className={`framing-canvas-container ${dragState ? "is-dragging" : ""}`}
        ref={containerRef}
        onClick={(e) => {
          // If user clicks on background canvas (not a crop box handle), toggle playback
          if (media?.kind !== "embed" && (e.target === containerRef.current || e.target.classList.contains("framing-source-video"))) {
            togglePlay();
          }
        }}
      >
        {media ? (
          media.kind === "embed" ? (
            <iframe
              src={media.src}
              className="framing-source-embed"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : (
            <video
              ref={handleVideoRef}
              src={media.src || media}
              className="framing-source-video"
              playsInline
              muted={muted}
              loop
              onLoadedMetadata={(e) => {
                setDuration(e.target.duration || 0);
              }}
              onTimeUpdate={(e) => {
                setCurTime(e.target.currentTime || 0);
              }}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
            />
          )
        ) : (
          <div className="framing-empty-placeholder">
            <span>Video source preview</span>
          </div>
        )}

        {/* Crop Boxes */}
        {frames.map((f, idx) => {
          const isActive = idx === activeFrameIdx;
          return (
            <div
              key={idx}
              className={`crop-box-element ${isActive ? "is-active" : ""}`}
              style={{
                left: `${f.x}%`,
                top: `${f.y}%`,
                width: `${f.width}%`,
                height: `${f.height}%`,
              }}
              onMouseDown={(e) => startDrag(e, idx, "move")}
              onTouchStart={(e) => startDrag(e, idx, "move")}
            >
              <div className="crop-box-badge">Frame {idx + 1} ({f.aspect_ratio})</div>

              {/* Resize Handles */}
              {isActive && (
                <>
                  <div className="crop-handle tl" onMouseDown={(e) => startDrag(e, idx, "resize", "tl")} />
                  <div className="crop-handle tr" onMouseDown={(e) => startDrag(e, idx, "resize", "tr")} />
                  <div className="crop-handle bl" onMouseDown={(e) => startDrag(e, idx, "resize", "bl")} />
                  <div className="crop-handle br" onMouseDown={(e) => startDrag(e, idx, "resize", "br")} />
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Video Playback & Timeline Controls */}
      {media && (
        media.kind === "embed" ? (
          <div className="framing-playback-bar framing-embed-notice">
            <div className="framing-playback-left">
              <span className="framing-embed-badge">
                <span className="dot" style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", display: "inline-block", marginRight: 6 }} />
                YouTube Player Active
              </span>
            </div>
            <div className="ctl-hint" style={{ fontSize: 12 }}>
              Play and seek the video directly using YouTube controls above while adjusting your framing boxes. Video is downloading in the background.
            </div>
          </div>
        ) : (
          <div className="framing-playback-bar">
            <div className="framing-playback-left">
              <button
                type="button"
                className="btn btn-sm btn-secondary framing-play-btn"
                onClick={togglePlay}
                title={playing ? "Pause" : "Play"}
              >
                {playing ? (
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                    <polygon points="6 3 20 12 6 21 6 3" />
                  </svg>
                )}
                <span>{playing ? "Pause" : "Play Video"}</span>
              </button>

              <button
                type="button"
                className="btn btn-sm btn-ghost framing-step-btn"
                onClick={() => stepTime(-5)}
                title="Step back 5 seconds"
              >
                -5s
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost framing-step-btn"
                onClick={() => stepTime(5)}
                title="Step forward 5 seconds"
              >
                +5s
              </button>
            </div>

            <div className="framing-scrub-group">
              <input
                type="range"
                className="range framing-scrub-slider"
                min={0}
                max={duration || 100}
                step={0.1}
                value={curTime}
                onChange={(e) => seek(+e.target.value)}
              />
              <span className="framing-time-display">
                {fmtTime(curTime)} / {fmtTime(duration)}
              </span>
            </div>

            <button
              type="button"
              className="btn btn-sm btn-ghost framing-mute-btn"
              onClick={toggleMute}
              title={muted ? "Unmute audio" : "Mute audio"}
            >
              {muted ? (
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                </svg>
              )}
            </button>
          </div>
        )
      )}

      <div className="framing-help-note">
        💡 <strong>Tip:</strong> Drag inside any frame to reposition. Drag corner handles to scale. In locked aspect ratios, sizing automatically maintains the chosen ratio constraint.
      </div>
    </div>
  );
}
