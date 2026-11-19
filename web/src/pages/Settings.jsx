import { useEffect, useState } from "react";
import { api } from "../api.js";
import ModelOnboarding from "../components/ModelOnboarding.jsx";

export default function Settings() {
  const [d, setD] = useState(null);
  const [modelInfo, setModelInfo] = useState(null);
  const [showModelModal, setShowModelModal] = useState(false);

  const loadData = () => {
    api.devices().then(setD).catch(() => setD({ devices: [], cuda_available: false }));
    api.systemAndModels().then(setModelInfo).catch(() => {});
  };

  useEffect(() => {
    loadData();
  }, []);

  const activeModelObj = modelInfo?.models?.find(
    (m) => m.id === (modelInfo.selected_model || modelInfo.active_model)
  );

  return (
    <>
      <div className="card" style={{ maxWidth: 620 }}>
        <div className="card-h"><h2>Speech Recognition & Hardware</h2></div>
        {!d ? <div className="note">Checking…</div> : (
          <>
            <div className="row" style={{ justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
              <div>
                <div style={{ fontWeight: 600 }}>Active Whisper Model</div>
                <div className="note" style={{ margin: "2px 0 0 0", fontSize: 12 }}>
                  {activeModelObj ? `${activeModelObj.name} (${activeModelObj.size_label}) — ${activeModelObj.tagline}` : (d.model_size || "—")}
                </div>
              </div>
              <button className="btn btn-sm" onClick={() => setShowModelModal(true)}>
                Change Model
              </button>
            </div>

            <div className="row" style={{ justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
              <span className="note" style={{ margin: 0 }}>GPU (CUDA)</span>
              <b>{d.cuda_available ? (d.gpu_name || "Available") : "Not available"}</b>
            </div>
            <div className="row" style={{ justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
              <span className="note" style={{ margin: 0 }}>Active device</span>
              <b>{(d.default || "—").toUpperCase()}</b>
            </div>
            <div className="row" style={{ justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
              <span className="note" style={{ margin: 0 }}>Available Devices</span>
              <b>{(d.devices || []).map((x) => x.toUpperCase()).join(" · ") || "—"}</b>
            </div>
            {modelInfo?.system && (
              <div className="row" style={{ justifyContent: "space-between", padding: "10px 0" }}>
                <span className="note" style={{ margin: 0 }}>Detected System</span>
                <span style={{ fontSize: 13, color: "var(--muted)" }}>
                  {modelInfo.system.cpu} ({modelInfo.system.ram_gb} GB RAM)
                </span>
              </div>
            )}
            <div className="note" style={{ marginTop: 16 }}>
              Everything runs locally — yt-dlp downloads, faster-whisper transcribes, and ffmpeg renders.
              No video or audio leaves this machine.
            </div>
          </>
        )}
      </div>

      {showModelModal && (
        <ModelOnboarding
          isModal={true}
          currentModel={modelInfo?.selected_model || modelInfo?.active_model}
          onClose={() => setShowModelModal(false)}
          onSelect={() => {
            setShowModelModal(false);
            loadData();
          }}
        />
      )}
    </>
  );
}
