import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";

const mb = (b) => (b / 1048576).toFixed(b >= 10485760 ? 0 : 1);

// Background "preparation" on Step 2: download the URL video (progress), then
// pre-transcribe it (progress) so Generate is instant. For uploads the file is
// already on disk, so it skips straight to transcription. Mirrors the vanilla
// app's prefetch + pretranscribe pipeline.
export function usePrep(device, language, autoTranscribe = true) {
  const [prep, setPrep] = useState({ phase: "idle", message: "", pct: null });
  const [downloadId, setDownloadId] = useState(null);
  const r = useRef({ pf: null, pt: null, sourceId: null, urlKey: null, skipTranscribe: false });
  const autoTranscribeRef = useRef(autoTranscribe);

  useEffect(() => {
    autoTranscribeRef.current = autoTranscribe;
  }, [autoTranscribe]);

  const lang = () => (language === "auto" ? null : language);
  const clear = () => { clearTimeout(r.current.pf); clearTimeout(r.current.pt); r.current.pf = r.current.pt = null; };

  function reset() {
    clear(); setDownloadId(null);
    r.current.sourceId = null; r.current.urlKey = null;
    setPrep({ phase: "idle", message: "", pct: null });
  }

  async function pollPrefetch(id) {
    try {
      const s = await api.prefetchStatus(id);
      if (s.status === "done") {
        setDownloadId(s.download_id);
        r.current.sourceId = s.download_id;
        if (r.current.skipTranscribe) {
          setPrep({ phase: "ready", message: "Ready — video loaded with cached captions", pct: 100 });
        } else if (autoTranscribeRef.current !== false) {
          setPrep({ phase: "downloaded", message: "Downloaded — preparing transcript…", pct: 100 });
          startTranscribe(s.download_id, lang());
        } else {
          setPrep({ phase: "ready", message: "Ready — video downloaded (auto-transcribe off)", pct: 100 });
        }
      } else if (s.status === "error") {
        r.current.urlKey = null;  // allow an automatic retry on re-entry
        setPrep({ phase: "error", message: s.error || s.message || "Download failed.", pct: null });
      } else {
        const total = s.total_bytes || 0, done = s.downloaded_bytes || 0;
        setPrep({ phase: "downloading", pct: total ? Math.round((done / total) * 100) : null,
          message: total ? `Downloading ${mb(done)} / ${mb(total)} MB`
            : done ? `Downloading ${mb(done)} MB…`
            : (s.message || "Starting download…") });
        r.current.pf = setTimeout(() => pollPrefetch(id), 500);
      }
    } catch { r.current.urlKey = null; setPrep((p) => ({ ...p, phase: "error", message: "Lost contact with the download." })); }
  }

  async function pollTranscribe(id) {
    try {
      const s = await api.pretranscribeStatus(id);
      if (s.status === "done") setPrep({ phase: "ready", message: "Ready — video & transcript prepared", pct: 100 });
      else if (s.status === "error") setPrep({ phase: "ready", message: "Video ready (transcript runs on Generate)", pct: 100 });
      else { setPrep({ phase: "transcribing", message: s.message || "Transcribing in the background…", pct: Math.round((s.progress || 0) * 100) }); r.current.pt = setTimeout(() => pollTranscribe(id), 700); }
    } catch {}
  }

  async function startTranscribe(sourceId, l) {
    clearTimeout(r.current.pt);
    r.current.sourceId = sourceId;
    setPrep({ phase: "transcribing", message: "Preparing transcript…", pct: 0 });
    try {
      const s = await api.pretranscribe(sourceId, device, l);
      if (s.status === "running") { setPrep({ phase: "transcribing", message: s.message || "Transcribing in the background…", pct: Math.round((s.progress || 0) * 100) }); r.current.pt = setTimeout(() => pollTranscribe(s.pretranscribe_id), 700); }
      else if (s.status === "done") setPrep({ phase: "ready", message: "Ready — video & transcript prepared", pct: 100 });
    } catch {}
  }

  function startUrl(url, skipTranscribe = false) {
    if (!url) return;
    r.current.skipTranscribe = !!skipTranscribe;
    if (r.current.urlKey === url) return; // already started/preparing this URL
    reset(); r.current.urlKey = url;
    r.current.skipTranscribe = !!skipTranscribe;
    setPrep({ phase: "downloading", message: "Starting download…", pct: null });
    api.prefetch(url).then((s) => {
      if (s.status === "done") {
        setDownloadId(s.download_id);
        r.current.sourceId = s.download_id;
        if (r.current.skipTranscribe) {
          setPrep({ phase: "ready", message: "Ready — video loaded with cached captions", pct: 100 });
        } else if (autoTranscribeRef.current !== false) {
          startTranscribe(s.download_id, lang());
        } else {
          setPrep({ phase: "ready", message: "Ready — video downloaded (auto-transcribe off)", pct: 100 });
        }
      }
      else r.current.pf = setTimeout(() => pollPrefetch(s.prefetch_id), 500);
    }).catch((e) => {
      r.current.urlKey = null;  // let re-entering Step 2 retry this URL
      setPrep({ phase: "error", message: "Could not start download: " + e.message, pct: null });
    });
  }

  function startUpload(uploadId, skipTranscribe = false) {
    if (!uploadId) return;
    r.current.skipTranscribe = !!skipTranscribe;
    if (r.current.sourceId === uploadId) return; // already preparing this upload
    clear(); setDownloadId(null);
    r.current.sourceId = uploadId;
    if (skipTranscribe) {
      setPrep({ phase: "ready", message: "Ready — video loaded with cached captions", pct: 100 });
      return;
    }
    if (autoTranscribeRef.current !== false) {
      startTranscribe(uploadId, lang());
    } else {
      setPrep({ phase: "ready", message: "Ready — video uploaded (auto-transcribe off)", pct: 100 });
    }
  }

  function manualTranscribe(sourceId) {
    const sid = sourceId || r.current.sourceId || downloadId;
    if (sid) startTranscribe(sid, lang());
  }

  // Re-prepare the transcript in a newly chosen language (download is reused).
  function relang(newLang) {
    if (r.current.sourceId && autoTranscribeRef.current !== false) {
      startTranscribe(r.current.sourceId, newLang === "auto" ? null : newLang);
    }
  }

  useEffect(() => () => clear(), []);
  return { prep, downloadId, startUrl, startUpload, manualTranscribe, relang, reset };
}
