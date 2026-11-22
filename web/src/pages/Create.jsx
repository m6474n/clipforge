import { useEffect, useMemo, useRef, useState } from "react";
import { api, streamProgress } from "../api.js";
import { parseEmbed, cineActive } from "../caption.js";
import { useStudio } from "../useStudio.js";
import { usePrep } from "../usePrep.js";
import ReframeEditor from "../components/ReframeEditor.jsx";
import Screen1Input from "./create/Screen1Input.jsx";
import Screen2Settings from "./create/Screen2Settings.jsx";
import Screen3Captions from "./create/Screen3Captions.jsx";
import Screen4Effects from "./create/Screen4Effects.jsx";
import Screen5Music from "./create/Screen5Music.jsx";
import Screen6Review from "./create/Screen5Review.jsx";
import Screen7Export from "./create/Screen6Export.jsx";

// Screen numbers 1-7: Source, Settings, Captions, Effects, Music, Review, Export.
// (Component file names kept as Screen5Review.jsx/Screen6Export.jsx from an
// earlier layout — only the wizard's step NUMBERS shifted when Music became
// its own screen.)
const WIZARD_LABELS = ["Source", "Settings", "Captions", "Effects", "Music", "Review", "Export"];

function targetAspectNum(aspect, fit) {
  if (fit === "square") return 1;
  return aspect === "16:9" ? 16 / 9 : 9 / 16;
}

export default function Create({ step, setStep }) {
  const [presets, setPresets] = useState([]);
  const [fonts, setFonts] = useState({ bundled: [], multilingual: [], user: [] });
  const [devices, setDevices] = useState(["auto"]);

  // Source
  const [source, setSource] = useState("url");
  const [url, setUrl] = useState("");
  const [upload, setUpload] = useState(null);
  const [upPct, setUpPct] = useState(null);
  const [objUrl, setObjUrl] = useState(null);
  const [drag, setDrag] = useState(false);

  // Output
  const [aspect, setAspect] = useState("9:16");
  const [fit, setFit] = useState("crop");
  const [barText, setBarText] = useState("");
  const [barTextColor, setBarTextColor] = useState("#FFFFFF");
  const [barTextAnim, setBarTextAnim] = useState("none");
  const [numClips, setNumClips] = useState(3);
  const [clipLen, setClipLen] = useState(null);   // target clip length in seconds; null = Auto (adaptive)
  const [language, setLanguage] = useState("auto");
  const [device, setDevice] = useState("auto");
  const [squareCorners, setSquareCorners] = useState("round");

  const outputAspect = fit === "square" ? "1:1" : aspect;
  function setOutputAspect(v) {
    if (v === "1:1") setFit("square");
    else { setFit("crop"); setAspect(v); }
  }

  // Background music
  const [tracks, setTracks] = useState([]);
  const [musicTrack, setMusicTrack] = useState("");
  const [musicVolume, setMusicVolume] = useState(35);
  const [musicDuck, setMusicDuck] = useState(70);
  const [musicStart, setMusicStart] = useState(0);
  const [musicSuggest, setMusicSuggest] = useState(null);

  // Signature / watermark
  const [signature, setSignature] = useState({ enabled: false, text: "@mosen_here", pos_x: 50, pos_y: 92, size: 34, color: "#FFFFFF", opacity: 75 });
  const setSig = (k, v) => setSignature((s) => ({ ...s, [k]: v }));

  // Framing (solo, duo, triple, quad)
  const [framing, setFraming] = useState({
    mode: "solo",
    split_pct: 50,
    frames: [{ x: 25, y: 10, width: 50, height: 80, aspect_ratio: "9:16" }],
  });

  // Fixed Text Overlay
  const [textOverlay, setTextOverlay] = useState({
    enabled: false,
    text: "WAIT TILL THE END 😱",
    font_family: "Roboto-Bold",
    font_size: 54,
    text_color: "#FFFFFF",
    bg_color: "#000000",
    bg_opacity: 80,
    padding: 16,
    border_radius: 12,
    alignment: "center",
    pos_x: 50,
    pos_y: 16,
  });

  // Social & Media Background Templates
  const [templateConfig, setTemplateConfig] = useState({
    preset: "none",
    avatar_url: null,
    display_name: "Alex Rivera",
    username: "alexrivera",
    verified: true,
    caption_text: "You won't believe what happened next…",
    video_scale: 100,
    video_pos_y: 50,
    custom_banner_url: null,
  });

  // Generate
  const [busy, setBusy] = useState(false);
  const [snap, setSnap] = useState(null);
  const [clips, setClips] = useState([]);
  const [clipId, setClipId] = useState(null);
  const [error, setError] = useState("");
  const closeRef = useRef(null);
  const jobRef = useRef(null);
  const fileRef = useRef(null);
  const generatedRef = useRef(false);

  // Reframe
  const [reframeTarget, setReframeTarget] = useState(null); // the clip object being reframed
  const reframeCache = useRef({}); // clipId:index -> last keyframes edited this session

  const videoRef = useRef(null);
  const [curTime, setCurTime] = useState(0);
  const [vidDuration, setVidDuration] = useState(null);
  const [transcript, setTranscript] = useState({ ready: false, loading: false, segments: [], duration: null });
  const [autoTranscribe, setAutoTranscribe] = useState(() => {
    return localStorage.getItem("cf_auto_transcribe") !== "false";
  });

  // Project Draft Persistence
  const [savedDraft, setSavedDraft] = useState(() => {
    try {
      const raw = localStorage.getItem("cf_active_project_draft");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [showTranscriptPrompt, setShowTranscriptPrompt] = useState(false);
  const promptShownRef = useRef(false);

  // Project Layout Templates
  const [templates, setTemplates] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("cf_saved_templates")) || [];
    } catch {
      return [];
    }
  });
  const [activeTemplateId, setActiveTemplateId] = useState(() => {
    return localStorage.getItem("cf_active_template_id") || "tpl_duo_split";
  });
  const [activeTemplateName, setActiveTemplateName] = useState("");

  useEffect(() => {
    api.templates().then((tpls) => {
      if (tpls && tpls.length) {
        setTemplates(tpls);
        try { localStorage.setItem("cf_saved_templates", JSON.stringify(tpls)); } catch {}
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    api.getConfig().then((cfg) => {
      if (cfg && cfg.auto_transcribe !== undefined) {
        setAutoTranscribe(cfg.auto_transcribe);
        localStorage.setItem("cf_auto_transcribe", cfg.auto_transcribe);
      }
    }).catch(() => {});
  }, []);

  const studio = useStudio(presets, fonts, language);
  const prep = usePrep(device, language, autoTranscribe);

  const applyTemplate = (tpl) => {
    if (!tpl) return;
    setActiveTemplateId(tpl.id);
    setActiveTemplateName(tpl.name);
    try { localStorage.setItem("cf_active_template_id", tpl.id); } catch {}

    if (tpl.framing) {
      setFraming(JSON.parse(JSON.stringify(tpl.framing)));
    }
    if (tpl.caption) {
      const ov = { ...(tpl.caption.overrides || {}) };
      if (tpl.caption.pos_x != null) ov.pos_x = tpl.caption.pos_x;
      if (tpl.caption.pos_y != null) ov.pos_y = tpl.caption.pos_y;
      studio.loadCaptionConfig(tpl.caption.preset || "alex_caps", ov, tpl.cinematic);
    }
    if (tpl.text_overlay) {
      setTextOverlay(JSON.parse(JSON.stringify(tpl.text_overlay)));
    }
    if (tpl.template_config) {
      setTemplateConfig(JSON.parse(JSON.stringify(tpl.template_config)));
    }
    if (tpl.output) {
      if (tpl.output.aspect) setAspect(tpl.output.aspect);
      if (tpl.output.fit) setFit(tpl.output.fit);
      if (tpl.output.square_corners) setSquareCorners(tpl.output.square_corners);
      if (tpl.output.bar_text !== undefined) setBarText(tpl.output.bar_text);
      if (tpl.output.bar_text_color) setBarTextColor(tpl.output.bar_text_color);
      if (tpl.output.bar_text_anim) setBarTextAnim(tpl.output.bar_text_anim);
    }
    if (tpl.signature) {
      setSignature(JSON.parse(JSON.stringify(tpl.signature)));
    }
  };

  const saveNewTemplate = async (name, desc) => {
    const tpl = {
      id: "tpl_" + Date.now().toString(36),
      name: name.trim(),
      description: (desc || "").trim(),
      is_default: false,
      framing: JSON.parse(JSON.stringify(framing)),
      caption: {
        preset: studio.activeKey || studio.styleId || "alex_caps",
        pos_x: studio.cfg?.pos_x ?? 50,
        pos_y: studio.cfg?.pos_y ?? 88,
        overrides: JSON.parse(JSON.stringify(studio.overrides || {})),
      },
      text_overlay: JSON.parse(JSON.stringify(textOverlay)),
      template_config: JSON.parse(JSON.stringify(templateConfig)),
      output: {
        aspect,
        fit,
        square_corners: squareCorners,
        bar_text: barText,
        bar_text_color: barTextColor,
        bar_text_anim: barTextAnim,
      },
      signature: JSON.parse(JSON.stringify(signature)),
      cinematic: JSON.parse(JSON.stringify(studio.cinematic)),
    };
    const saved = await api.saveTemplate(tpl);
    setTemplates((prev) => {
      const next = [...prev.filter((t) => t.id !== saved.id), saved];
      try { localStorage.setItem("cf_saved_templates", JSON.stringify(next)); } catch {}
      return next;
    });
    setActiveTemplateId(saved.id);
    setActiveTemplateName(saved.name);
    return saved;
  };

  const deleteTemplate = async (id) => {
    await api.deleteTemplate(id);
    setTemplates((prev) => {
      const next = prev.filter((t) => t.id !== id);
      try { localStorage.setItem("cf_saved_templates", JSON.stringify(next)); } catch {}
      return next;
    });
    if (activeTemplateId === id) {
      setActiveTemplateId(null);
      setActiveTemplateName(null);
    }
  };

  function startPrep() {
    if (source === "url" && url.trim()) prep.startUrl(url.trim());
    else if (source === "upload" && upload?.upload_id) prep.startUpload(upload.upload_id);
  }

  // Background download/pre-transcribe kicks off the moment Screen 2 is
  // entered, so it's finished (or well underway) by the time Screen 3/5 need it.
  useEffect(() => {
    if (step >= 2) startPrep();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step >= 2, source, upload?.upload_id, url]);

  useEffect(() => {
    api.captionStyles().then((p) => setPresets(p || [])).catch(() => {});
    api.fonts().then((f) => setFonts(f || { bundled: [], multilingual: [], user: [] })).catch(() => {});
    api.devices().then((d) => { setDevices(d.devices || ["auto"]); setDevice(d.cuda_available ? "cuda" : "cpu"); }).catch(() => {});
    api.music().then((m) => setTracks(m.tracks || [])).catch(() => {});
    return () => closeRef.current && closeRef.current();
  }, []);

  const refreshMusic = () => api.music().then((m) => setTracks(m.tracks || [])).catch(() => {});
  async function onMusicUpload(file) { const t = await api.uploadMusic(file); await refreshMusic(); return t; }

  useEffect(() => {
    const all = [...(fonts.user || []), ...(fonts.multilingual || []), ...(fonts.bundled || [])];
    let css = "";
    all.forEach((f) => { css += `@font-face{font-family:'${f.family}';src:url('/fonts/${encodeURIComponent(f.file)}');font-display:swap;}`; });
    let el = document.getElementById("cf-fontfaces");
    if (!el) { el = document.createElement("style"); el.id = "cf-fontfaces"; document.head.appendChild(el); }
    el.textContent = css;
  }, [fonts]);

  const media = useMemo(() => {
    if (source === "upload") {
      if (objUrl) return { kind: "video", src: objUrl };
      if (upload?.upload_id) return { kind: "video", src: `/api/download/${upload.upload_id}/video` };
      return null;
    }
    if (prep.downloadId) return { kind: "video", src: `/api/download/${prep.downloadId}/video` };
    return parseEmbed(url.trim());
  }, [source, objUrl, upload, url, prep.downloadId]);

  const srcId = (source === "upload" ? upload?.upload_id : prep.downloadId) || null;
  useEffect(() => {
    if (!srcId) { setMusicSuggest(null); return; }
    let alive = true;
    api.musicSuggest(srcId, language === "auto" ? null : language)
      .then((m) => { if (alive && m && m.ready) setMusicSuggest(m); })
      .catch(() => {});
    return () => { alive = false; };
  }, [srcId, language, prep.prep?.phase]);

  useEffect(() => {
    if (!srcId) { setTranscript({ ready: false, loading: false, segments: [], duration: null }); return; }
    let alive = true;
    setTranscript((t) => ({ ...t, loading: true }));
    api.transcript(srcId, language === "auto" ? null : language)
      .then((d) => { if (alive) setTranscript({ ready: !!d.ready, loading: false, segments: d.segments || [], duration: d.duration ?? null }); })
      .catch(() => { if (alive) setTranscript((t) => ({ ...t, loading: false })); });
    return () => { alive = false; };
  }, [srcId, language, prep.prep?.phase]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) { setVidDuration(null); return; }
    const onTime = () => setCurTime(v.currentTime);
    const onMeta = () => setVidDuration(isFinite(v.duration) ? v.duration : null);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onMeta);
    if (v.readyState >= 1 && isFinite(v.duration)) setVidDuration(v.duration);
    return () => { v.removeEventListener("timeupdate", onTime); v.removeEventListener("loadedmetadata", onMeta); };
  }, [media]);

  function seekTo(t) {
    if (t == null || !isFinite(t)) return;
    const v = videoRef.current;
    if (v) { try { v.currentTime = Math.max(0, t); } catch { /* not seekable yet */ } }
    setCurTime(t);
  }

  async function doUpload(file) {
    if (!file) { setSource("url"); setUpload(null); setUpPct(null); if (objUrl) { URL.revokeObjectURL(objUrl); setObjUrl(null); } return; }
    setSource("upload"); setUpload(null); setUpPct(0); setError("");
    if (objUrl) URL.revokeObjectURL(objUrl);
    setObjUrl(URL.createObjectURL(file));
    try { const d = await api.upload(file, setUpPct); setUpload({ upload_id: d.upload_id, filename: d.filename || file.name }); setUpPct(null); }
    catch (e) { setError(e.message); setUpPct(null); }
  }

  async function onFontUpload(file) {
    const d = await api.uploadFont(file);
    const fresh = await api.fonts();
    setFonts(fresh);
    return d.family;
  }

  function changeLanguage(v) { setLanguage(v); studio.onLanguageChange(v); prep.relang(v); }

  const sourceReady = source === "upload" ? !!(upload || objUrl) : !!url.trim();

  const prepView = useMemo(() => {
    const base = (source === "upload" && upPct != null && !upload)
      ? { phase: "downloading", pct: upPct, message: upPct >= 100 ? "Processing upload…" : "Uploading your video…" }
      : { ...prep.prep };
    return {
      ...base,
      autoTranscribe,
      transcriptReady: !!transcript.ready,
      onManualTranscribe: () => prep.manualTranscribe(srcId),
    };
  }, [source, upPct, upload, prep.prep, autoTranscribe, transcript.ready, srcId]);

  async function generate() {
    setError("");
    const payload = {
      aspect_ratio: aspect, fit_mode: fit,
      bar_text: fit === "square" ? (barText.trim() || null) : null,
      bar_text_color: barTextColor, bar_text_anim: barTextAnim,
      num_clips: numClips, device, caption_style: studio.styleId,
      language: language === "auto" ? null : language,
      square_corners: squareCorners,
    };
    if (clipLen != null) payload.clip_length = clipLen;
    if (framing) payload.framing = framing;
    if (textOverlay && textOverlay.enabled) payload.text_overlay = textOverlay;
    if (templateConfig && templateConfig.preset !== "none") payload.template = templateConfig;
    if (Object.keys(studio.overrides).length) payload.caption_overrides = studio.overrides;
    if (cineActive(studio.cinematic)) payload.cinematic = studio.cinematic;
    if (musicTrack) { payload.music_track = musicTrack; payload.music_volume = musicVolume; payload.music_duck = musicDuck; payload.music_start = musicStart; }
    if (signature.enabled && (signature.text || "").trim()) payload.signature = signature;
    if (source === "upload") {
      if (!upload) { setError("Wait for the upload to finish."); return; }
      payload.upload_id = upload.upload_id; payload.upload_name = upload.filename;
    } else {
      if (!url.trim()) { setError("Paste a video URL."); return; }
      payload.video_url = url.trim();
      if (prep.downloadId) payload.download_id = prep.downloadId;
    }

    setBusy(true); setClips([]); setSnap({ stage: "queued", progress: 0.02, message: "Starting…", status: "running" });
    try {
      const { job_id } = await api.generate(payload);
      jobRef.current = job_id;
      try { sessionStorage.setItem("cf-active-job-id", job_id); } catch {}
      closeRef.current = streamProgress(job_id, (sn) => {
        setSnap(sn);
        if (sn.clips) setClips(sn.clips);
        if (sn.clip_id) setClipId(sn.clip_id);
        if (sn.status === "done" || sn.status === "error" || sn.status === "cancelled") {
          setBusy(false);
          if (sn.status === "error") setError(sn.error || sn.message || "Pipeline failed.");
          try { sessionStorage.removeItem("cf-active-job-id"); } catch {}
          closeRef.current && closeRef.current();
        }
      }, () => { setBusy(false); setError("Lost connection to the progress stream."); });
    } catch (e) { setBusy(false); setError(e.message); }
  }

  function cancelGenerate() {
    if (jobRef.current) api.cancel(jobRef.current).catch(() => {});
    try { sessionStorage.removeItem("cf-active-job-id"); } catch {}
    closeRef.current && closeRef.current();
    setBusy(false); setSnap(null); setError("");
    generatedRef.current = false;
  }

  // Restore active job on reload if one was in progress
  useEffect(() => {
    const savedJobId = sessionStorage.getItem("cf-active-job-id");
    if (savedJobId && !jobRef.current) {
      jobRef.current = savedJobId;
      setBusy(true);
      closeRef.current = streamProgress(savedJobId, (sn) => {
        setSnap(sn);
        if (sn.clips) setClips(sn.clips);
        if (sn.clip_id) setClipId(sn.clip_id);
        if (sn.status === "done" || sn.status === "error" || sn.status === "cancelled") {
          setBusy(false);
          if (sn.status === "error") setError(sn.error || sn.message || "Pipeline failed.");
          try { sessionStorage.removeItem("cf-active-job-id"); } catch {}
          closeRef.current && closeRef.current();
        }
      }, () => { setBusy(false); });
    }
  }, []);

  // Screen 6 (Review) — auto-render every clip the instant this screen is entered.
  useEffect(() => {
    if (step === 6 && !generatedRef.current && !busy && clips.length === 0) {
      generatedRef.current = true;
      generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function openReframe(clip) {
    setReframeTarget(clip);
  }
  function closeReframe() { setReframeTarget(null); }
  function onReframeSaved(index, newUrl, keyframes) {
    reframeCache.current[`${clipId}:${index}`] = keyframes;
    setClips((cs) => cs.map((c) => (c.index === index ? { ...c, url: newUrl } : c)));
    setReframeTarget(null);
  }

  const saveProjectDraft = (overrideStep) => {
    if (!sourceReady) return null;
    const draft = {
      savedAt: Date.now(),
      savedAtText: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      step: overrideStep || step,
      source,
      url,
      upload: upload ? { upload_id: upload.upload_id, filename: upload.filename } : null,
      aspect,
      fit,
      squareCorners,
      barText,
      barTextColor,
      barTextAnim,
      numClips,
      clipLen,
      language,
      device,
      signature: JSON.parse(JSON.stringify(signature)),
      framing: JSON.parse(JSON.stringify(framing)),
      textOverlay: JSON.parse(JSON.stringify(textOverlay)),
      templateConfig: JSON.parse(JSON.stringify(templateConfig)),
      captionPreset: studio.activeKey || studio.styleId || "alex_caps",
      captionOverrides: JSON.parse(JSON.stringify(studio.overrides || {})),
      cinematic: JSON.parse(JSON.stringify(studio.cinematic || {})),
      musicTrack,
      musicVolume,
      musicDuck,
      musicStart,
      hasTranscript: !!transcript.ready,
      transcriptCount: transcript.segments?.length || 0,
      transcriptDuration: transcript.duration,
      transcriptSegments: (transcript.segments || []).slice(0, 500),
    };
    try {
      localStorage.setItem("cf_active_project_draft", JSON.stringify(draft));
      setSavedDraft(draft);
    } catch {}
    return draft;
  };

  const resumeDraft = () => {
    if (!savedDraft) return;
    setSource(savedDraft.source || "url");
    setUrl(savedDraft.url || "");
    if (savedDraft.upload) {
      setUpload(savedDraft.upload);
    }
    if (savedDraft.aspect) setAspect(savedDraft.aspect);
    if (savedDraft.fit) setFit(savedDraft.fit);
    if (savedDraft.squareCorners) setSquareCorners(savedDraft.squareCorners);
    if (savedDraft.barText !== undefined) setBarText(savedDraft.barText);
    if (savedDraft.barTextColor) setBarTextColor(savedDraft.barTextColor);
    if (savedDraft.barTextAnim) setBarTextAnim(savedDraft.barTextAnim);
    if (savedDraft.numClips) setNumClips(savedDraft.numClips);
    if (savedDraft.clipLen !== undefined) setClipLen(savedDraft.clipLen);
    if (savedDraft.language) setLanguage(savedDraft.language);
    if (savedDraft.device) setDevice(savedDraft.device);
    if (savedDraft.signature) setSignature(savedDraft.signature);
    if (savedDraft.framing) setFraming(savedDraft.framing);
    if (savedDraft.textOverlay) setTextOverlay(savedDraft.textOverlay);
    if (savedDraft.templateConfig) setTemplateConfig(savedDraft.templateConfig);
    if (savedDraft.musicTrack !== undefined) setMusicTrack(savedDraft.musicTrack);
    if (savedDraft.musicVolume !== undefined) setMusicVolume(savedDraft.musicVolume);
    if (savedDraft.musicDuck !== undefined) setMusicDuck(savedDraft.musicDuck);
    if (savedDraft.musicStart !== undefined) setMusicStart(savedDraft.musicStart);

    if (savedDraft.captionPreset) {
      studio.loadCaptionConfig(savedDraft.captionPreset, savedDraft.captionOverrides, savedDraft.cinematic);
    }

    if (savedDraft.transcriptSegments && savedDraft.transcriptSegments.length) {
      setTranscript({
        ready: true,
        loading: false,
        segments: savedDraft.transcriptSegments,
        duration: savedDraft.transcriptDuration || null,
      });
    }

    const targetStep = Math.max(2, savedDraft.step || 2);
    setStep(targetStep);

    if (savedDraft.source === "url" && savedDraft.url) {
      prep.startUrl(savedDraft.url);
    } else if (savedDraft.upload?.upload_id) {
      prep.startUpload(savedDraft.upload.upload_id);
    }
  };

  const clearDraft = () => {
    try {
      localStorage.removeItem("cf_active_project_draft");
    } catch {}
    setSavedDraft(null);
    setShowTranscriptPrompt(false);
    promptShownRef.current = false;
    restart();
  };

  // When transcript finishes in background, notify the user with option to save/clear
  useEffect(() => {
    if (transcript.ready && !promptShownRef.current && (srcId || sourceReady)) {
      promptShownRef.current = true;
      saveProjectDraft(step);
      setShowTranscriptPrompt(true);
    }
  }, [transcript.ready, srcId, sourceReady]);

  // Keep draft updated whenever user progresses past Step 1
  useEffect(() => {
    if (step >= 2 && sourceReady) {
      saveProjectDraft(step);
    }
  }, [step]);

  function restart() {
    setStep(1);
    setSource("url"); setUrl(""); setUpload(null); setUpPct(null);
    if (objUrl) URL.revokeObjectURL(objUrl);
    setObjUrl(null);
    setClips([]); setSnap(null); setError(""); setClipId(null);
    generatedRef.current = false;
    prep.reset();
  }

  if (reframeTarget) {
    const key = `${clipId}:${reframeTarget.index}`;
    return (
      <ReframeEditor
        clipId={clipId}
        clip={reframeTarget}
        targetAspect={targetAspectNum(aspect, fit)}
        initialKeyframes={reframeCache.current[key]}
        onClose={closeReframe}
        onSaved={onReframeSaved}
      />
    );
  }

  const showStepper = step >= 2 && step <= 7;

  return (
    <>
      {step === 1 && (
        <Screen1Input
          source={source} setSource={setSource} url={url} setUrl={setUrl}
          upload={upload} upPct={upPct} drag={drag} setDrag={setDrag} fileRef={fileRef}
          doUpload={doUpload} onClear={() => doUpload(null)} sourceReady={sourceReady} error={error}
          templates={templates} activeTemplateId={activeTemplateId} onApplyTemplate={applyTemplate}
          savedDraft={savedDraft} onResumeDraft={resumeDraft} onClearDraft={clearDraft}
          onContinue={() => { startPrep(); setStep(2); }}
        />
      )}

      {step === 2 && (
        <Screen2Settings
          media={media} sourceReady={sourceReady} prepView={prepView}
          outputAspect={outputAspect} setOutputAspect={setOutputAspect}
          squareCorners={squareCorners} setSquareCorners={setSquareCorners}
          barText={barText} setBarText={setBarText} barTextColor={barTextColor} setBarTextColor={setBarTextColor}
          barTextAnim={barTextAnim} setBarTextAnim={setBarTextAnim}
          language={language} changeLanguage={changeLanguage}
          device={device} setDevice={setDevice} devices={devices}
          numClips={numClips} setNumClips={setNumClips} clipLen={clipLen} setClipLen={setClipLen}
          duration={vidDuration || transcript.duration || (prepView && prepView.duration)}
          framing={framing} setFraming={setFraming}
          textOverlay={textOverlay} setTextOverlay={setTextOverlay}
          templateConfig={templateConfig} setTemplateConfig={setTemplateConfig}
          studio={studio} fonts={fonts} aspect={aspect} fit={fit} signature={signature} setSig={setSig} videoRef={videoRef}
          templates={templates} activeTemplateId={activeTemplateId}
          onApplyTemplate={applyTemplate} onSaveTemplate={saveNewTemplate} onDeleteTemplate={deleteTemplate}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
          nextEnabled={!["downloading", "idle"].includes(prepView.phase)}
        />
      )}

      {step === 3 && (
        <Screen3Captions
          studio={studio} language={language} onFontUpload={onFontUpload}
          media={media} prepView={prepView} sourceReady={sourceReady}
          transcript={transcript} curTime={curTime} seekTo={seekTo} videoRef={videoRef} duration={vidDuration}
          aspect={aspect} fit={fit} barText={barText} barTextColor={barTextColor} barTextAnim={barTextAnim}
          signature={signature} setSig={setSig}
          framing={framing} setFraming={setFraming} textOverlay={textOverlay} setTextOverlay={setTextOverlay} templateConfig={templateConfig}
          onBack={() => setStep(2)} onNext={() => setStep(4)}
        />
      )}

      {step === 4 && (
        <Screen4Effects
          studio={studio} language={language} media={media} sourceReady={sourceReady}
          aspect={aspect} fit={fit} barText={barText} barTextColor={barTextColor} barTextAnim={barTextAnim}
          signature={signature} setSig={setSig} videoRef={videoRef}
          framing={framing} setFraming={setFraming} textOverlay={textOverlay} setTextOverlay={setTextOverlay} templateConfig={templateConfig}
          onBack={() => setStep(3)} onNext={() => setStep(5)}
        />
      )}

      {step === 5 && (
        <Screen5Music
          tracks={tracks} musicTrack={musicTrack} musicVolume={musicVolume} musicDuck={musicDuck}
          musicStart={musicStart} musicSuggest={musicSuggest}
          onTrack={(t) => { setMusicTrack(t); setMusicStart(0); }} onVolume={setMusicVolume} onDuck={setMusicDuck} onStart={setMusicStart}
          onMusicUpload={onMusicUpload} onRefreshMusic={refreshMusic}
          studio={studio} language={language} media={media} sourceReady={sourceReady}
          aspect={aspect} fit={fit} barText={barText} barTextColor={barTextColor} barTextAnim={barTextAnim}
          signature={signature} setSig={setSig} videoRef={videoRef}
          framing={framing} setFraming={setFraming} textOverlay={textOverlay} setTextOverlay={setTextOverlay} templateConfig={templateConfig}
          onBack={() => setStep(4)} onNext={() => setStep(6)}
        />
      )}

      {step === 6 && (
        <Screen6Review
          busy={busy} snap={snap} clips={clips} error={error}
          onCancel={cancelGenerate} onOpenReframe={openReframe}
          onBack={() => setStep(5)} onNext={() => setStep(7)}
        />
      )}

      {step === 7 && (
        <Screen7Export clips={clips} onBack={() => setStep(6)} onRestart={restart} />
      )}

      {showTranscriptPrompt && (
        <div className="transcript-prompt-overlay" onClick={() => setShowTranscriptPrompt(false)}>
          <div className="transcript-prompt-modal card" onClick={(e) => e.stopPropagation()}>
            <div className="tpm-header">
              <div className="tpm-icon">✨</div>
              <div className="tpm-titles">
                <h3>Captions Generated &amp; Project Saved!</h3>
                <p>
                  Whisper AI transcribed <strong>{transcript.segments?.length || 0} segments</strong>.
                  Your project is cached so you can adjust frames, templates, and caption styles without ever waiting for transcription again!
                </p>
              </div>
            </div>
            <div className="tpm-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  saveProjectDraft(step);
                  setShowTranscriptPrompt(false);
                }}
              >
                <Icons.check /> Continue Editing Frames
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  saveProjectDraft(step);
                  setShowTranscriptPrompt(false);
                  setStep(2);
                }}
              >
                📐 Adjust Framing &amp; Layout
              </button>
              <button
                type="button"
                className="btn btn-danger-outline"
                onClick={() => {
                  clearDraft();
                }}
              >
                🗑️ Clear Project &amp; Start New
              </button>
            </div>
          </div>
        </div>
      )}

      {showStepper && (
        <div className="wizard-bottom-container">
          <div className="wizard-draft-bar">
            <span className="wdb-label">
              {transcript.ready ? "🟢 Captions Cached" : "⚡ Project Active"}
            </span>
            <div className="wdb-btns">
              <button
                type="button"
                className="btn-wdb-save"
                onClick={() => {
                  saveProjectDraft(step);
                  alert("Project draft & captions saved!");
                }}
                title="Save current project draft"
              >
                💾 Save Draft
              </button>
              <button
                type="button"
                className="btn-wdb-clear"
                onClick={() => {
                  if (window.confirm("Clear this project draft and start fresh?")) {
                    clearDraft();
                  }
                }}
                title="Discard project draft"
              >
                🗑️ Clear Project
              </button>
            </div>
          </div>

          <div className="wizard-steps wizard-steps-bottom">
            {WIZARD_LABELS.slice(1).map((lbl, i) => {
              const n = i + 2;
              return (
                <button key={lbl} type="button" className={"wizard-step" + (step === n ? " active" : step > n ? " done" : "")}
                  onClick={() => setStep(n)} title={`Jump to ${lbl}`}>
                  <span className="wizard-step-dot">{step > n ? "✓" : n - 1}</span>
                  <span className="wizard-step-lbl">{lbl}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
