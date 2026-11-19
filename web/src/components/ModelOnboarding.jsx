import { useEffect, useState } from "react";
import { api } from "../api.js";
import { Icons } from "./Icons.jsx";

export default function ModelOnboarding({ onSelect, currentModel, isModal = false, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(currentModel || "large-v3-turbo");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let alive = true;
    api.systemAndModels()
      .then((res) => {
        if (!alive) return;
        setData(res);
        const initial = currentModel || res.selected_model || res.system?.suggested_model || "large-v3-turbo";
        setSelectedId(initial);
        setLoading(false);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err.message || "Failed to load hardware specs");
        setLoading(false);
      });
    return () => { alive = false; };
  }, [currentModel]);

  const handleConfirm = async () => {
    if (!selectedId) return;
    setSubmitting(true);
    try {
      await api.selectModel(selectedId);
      if (onSelect) onSelect(selectedId);
    } catch (err) {
      alert("Failed to set model: " + err.message);
      setSubmitting(false);
    }
  };

  const sys = data?.system;
  const models = data?.models || [];
  const selectedModelObj = models.find((m) => m.id === selectedId);

  return (
    <div className={"model-onboarding-wrapper" + (isModal ? " is-modal" : "")}>
      <div className="model-onboarding-card">
        {isModal && (
          <button className="onboarding-close-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        )}

        <div className="onboarding-header">
          <div className="onboarding-badge">AI Speech Engine</div>
          <h1 className="onboarding-title">Select Your Speech Recognition Model</h1>
          <p className="onboarding-subtitle">
            ClipForge uses local OpenAI Whisper models to transcribe speech, detect viral hooks, and mark word-level cut timestamps.
          </p>
        </div>

        {loading ? (
          <div className="onboarding-loading">
            <div className="spinner" />
            <span>Analyzing system hardware & available models…</span>
          </div>
        ) : error ? (
          <div className="onboarding-error">
            <span>{error}</span>
          </div>
        ) : (
          <>
            {/* System Specs Banner */}
            <div className="sys-spec-banner">
              <div className="sys-spec-top">
                <div className="sys-spec-icon">
                  <Icons.bolt />
                </div>
                <div className="sys-spec-info">
                  <div className="sys-spec-label">Detected Hardware</div>
                  <div className="sys-spec-value">
                    {sys?.cpu} · {sys?.ram_gb} GB RAM · {sys?.cuda_available ? `GPU: ${sys?.gpu_name || "CUDA"}` : "CPU Mode"}
                  </div>
                </div>
              </div>
              {sys?.reason && (
                <div className="sys-spec-reason">
                  <strong>Recommendation:</strong> {sys.reason}
                </div>
              )}
            </div>

            {/* Model Selection Grid */}
            <div className="model-cards-grid">
              {models.map((m) => {
                const isSelected = selectedId === m.id;
                const isSuggested = sys?.suggested_model === m.id;

                return (
                  <div
                    key={m.id}
                    className={`model-card ${isSelected ? "selected" : ""} ${isSuggested ? "suggested" : ""}`}
                    onClick={() => setSelectedId(m.id)}
                  >
                    <div className="model-card-top">
                      <div className="model-radio">
                        <div className={`radio-circle ${isSelected ? "checked" : ""}`} />
                        <div>
                          <div className="model-name">
                            {m.name}
                            {m.badge && (
                              <span className={`model-badge ${m.badge === "Recommended" ? "badge-rec" : ""}`}>
                                {m.badge}
                              </span>
                            )}
                          </div>
                          <div className="model-tagline">{m.tagline}</div>
                        </div>
                      </div>
                      <div className="model-size-tag">{m.size_label}</div>
                    </div>

                    <div className="model-specs-row">
                      <span className="spec-pill">
                        <strong>Accuracy:</strong> {m.accuracy}
                      </span>
                      <span className="spec-pill">
                        <strong>Speed:</strong> {m.speed}
                      </span>
                    </div>

                    <p className="model-desc">{m.description}</p>
                  </div>
                );
              })}
            </div>

            {/* Bottom Actions */}
            <div className="onboarding-actions">
              <div className="action-summary">
                Selected: <strong>{selectedModelObj?.name || selectedId}</strong> ({selectedModelObj?.size_label})
                <div className="action-subtext">Runs 100% locally on your machine. Model weights download once and cache permanently.</div>
              </div>
              <button
                className="btn btn-primary btn-lg"
                onClick={handleConfirm}
                disabled={submitting}
              >
                {submitting ? "Initializing…" : `Confirm & Use ${selectedModelObj?.name || "Model"}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
