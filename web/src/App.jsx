import { useEffect, useState } from "react";
import { api } from "./api.js";
import { Icons } from "./components/Icons.jsx";
import ModelOnboarding from "./components/ModelOnboarding.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import Create from "./pages/Create.jsx";
import Library from "./pages/Library.jsx";
import Settings from "./pages/Settings.jsx";
import HomeNavbar from "./components/HomeNavbar.jsx";
import ToolsDrawer from "./components/ToolsDrawer.jsx";
import { TOOLS } from "./toolsConfig.js";

const TITLES = {
  create: { h: "Create clips", sub: "Turn any video into captioned vertical shorts" },
  library: { h: "Library", sub: "Every clip you've generated" },
  settings: { h: "Settings", sub: "Compute device & environment" },
};

const THEMES = [
  { id: "dark", label: "Dark" },
  { id: "light", label: "Light" },
];

// First-run (and every relaunch, briefly) splash while the whisper model
// loads. On a fresh install this can take a few minutes to download — this
// screen is the fix for that looking "stuck": real progress instead of a
// refused connection or a blank tab.
function ModelSplash({ status, onSwitchModel }) {
  const pct = status.progress != null ? Math.round(status.progress * 100) : null;
  const failed = status.status === "error";
  return (
    <div className="model-splash">
      <div className="model-splash-mark"><Icons.bolt /></div>
      <div className="model-splash-title">ClipForge</div>
      {failed ? (
        <>
          <div className="model-splash-msg" style={{ color: "var(--danger)" }}>Could not start the AI engine.</div>
          <div className="model-splash-detail">{status.message}</div>
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>Retry</button>
            {onSwitchModel && (
              <button className="btn" onClick={onSwitchModel}>Switch Model</button>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="model-splash-msg">{status.message || "Starting up…"}</div>
          <div className="track model-splash-track">
            <div className={"fill" + (pct == null ? " indeterminate" : "")} style={pct == null ? {} : { width: pct + "%" }} />
          </div>
          {status.status === "downloading" && (
            <div className="model-splash-detail">One-time download — this machine won't need it again.</div>
          )}
          {onSwitchModel && (
            <div style={{ marginTop: 22, display: "flex", justifyContent: "center" }}>
              <button
                className="btn btn-sm"
                style={{
                  background: "var(--surface-2, rgba(255,255,255,0.06))",
                  border: "1px solid var(--line-2, rgba(255,255,255,0.2))",
                  color: "var(--fg, #fff)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 16px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
                onClick={onSwitchModel}
                title="Cancel current model download and pick a lighter or cached model"
              >
                <span style={{ fontSize: 11, color: "var(--danger, #ef4444)" }}>⏹</span>
                <span>Stop Download & Switch Model</span>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Segmented light/dark switch. Writes the choice to <html data-theme> and
// remembers it across reloads. "dark" is the CSS default, so we clear the attr.
function ThemeSwitch({ theme, setTheme, fixed }) {
  return (
    <div className={"theme-switch" + (fixed ? " theme-switch-fixed" : "")} role="group" aria-label="Theme">
      {THEMES.map((t) => (
        <button key={t.id} className={theme === t.id ? "active" : ""}
          onClick={() => setTheme(t.id)} title={`${t.label} theme`}>{t.label}</button>
      ))}
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState("create");
  const [step, setStep] = useState(1);
  const [device, setDevice] = useState(null);
  const [online, setOnline] = useState(null);
  const [toolsDrawerOpen, setToolsDrawerOpen] = useState(false);
  const [activeToolId, setActiveToolId] = useState("clipper");
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem("cf-theme") || "dark"; } catch { return "dark"; }
  });
  const [modelStatus, setModelStatus] = useState({ status: "idle", message: "", progress: null });
  const [isSwitchingModel, setIsSwitchingModel] = useState(false);

  // Poll until the whisper model is ready (or fails) — fast while it's
  // loading/downloading, then stops (no need to keep polling afterward).
  useEffect(() => {
    let alive = true;
    let timer;
    async function tick() {
      try {
        const s = await api.modelStatus();
        if (!alive) return;
        if (!isSwitchingModel) {
          setModelStatus(s);
        }
        if (s.status === "ready" || s.status === "error") return;
      } catch { /* server still coming up — keep trying */ }
      if (alive) timer = setTimeout(tick, 1000);
    }
    tick();
    return () => { alive = false; clearTimeout(timer); };
  }, [isSwitchingModel]);

  const handleCancelAndSwitch = async () => {
    setIsSwitchingModel(true);
    setModelStatus({ status: "needs_onboarding", message: "Select a model", progress: null });
    try {
      await api.cancelModel();
    } catch (err) {
      console.warn("Cancel model call error:", err);
    }
  };

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    try { localStorage.setItem("cf-theme", theme); } catch { /* ignore */ }
  }, [theme]);

  useEffect(() => {
    let alive = true;
    const ping = () =>
      api.health()
        .then((d) => { if (alive) { setOnline(true); setDevice(d.device); } })
        .catch(() => { if (alive) setOnline(false); });
    ping();
    const t = setInterval(ping, 8000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  useEffect(() => {
    if (page === "library" && activeToolId !== "library") {
      setActiveToolId("library");
    } else if (page === "settings" && activeToolId !== "settings") {
      setActiveToolId("settings");
    } else if (page === "create" && (activeToolId === "library" || activeToolId === "settings")) {
      setActiveToolId("clipper");
    }
  }, [page]);

  const t = TITLES[page] || TITLES.create;

  const handleSelectTool = (tool) => {
    setActiveToolId(tool.id);
    if (tool.id === "library") {
      setPage("library");
    } else if (tool.id === "settings") {
      setPage("settings");
    } else {
      setPage("create");
      setStep(1);
    }
  };

  if (isSwitchingModel || modelStatus.status === "needs_onboarding") {
    return (
      <div className="shell">
        <HomeNavbar
          activeToolId={activeToolId}
          onSelectTool={handleSelectTool}
          onOpenDrawer={() => setToolsDrawerOpen(true)}
          theme={theme}
          setTheme={setTheme}
          online={online}
          device={device}
        />
        <div className="content">
          <ModelOnboarding
            onSelect={(id) => {
              setIsSwitchingModel(false);
              setModelStatus({ status: "downloading", message: `Preparing '${id}' model…`, progress: 0.0, model_size: id });
            }}
          />
        </div>
      </div>
    );
  }

  if (modelStatus.status !== "ready") {
    return (
      <div className="shell">
        <HomeNavbar
          activeToolId={activeToolId}
          onSelectTool={handleSelectTool}
          onOpenDrawer={() => setToolsDrawerOpen(true)}
          theme={theme}
          setTheme={setTheme}
          online={online}
          device={device}
        />
        <div className="content">
          <ModelSplash
            status={modelStatus}
            onSwitchModel={handleCancelAndSwitch}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="shell">
      <ToolsDrawer
        isOpen={toolsDrawerOpen}
        onClose={() => setToolsDrawerOpen(false)}
        activeToolId={activeToolId}
        onSelectTool={handleSelectTool}
        online={online}
        device={device}
      />

      <div className="main">
        <HomeNavbar
          activeToolId={activeToolId}
          onSelectTool={handleSelectTool}
          onOpenDrawer={() => setToolsDrawerOpen(true)}
          theme={theme}
          setTheme={setTheme}
          online={online}
          device={device}
        />

        <div className="content">
          {/* Ambient orbs active across all pages */}
          <div className="landing-orbs" aria-hidden="true">
            <span className="orb orb-1" />
            <span className="orb orb-2" />
            <span className="orb orb-3" />
            <span className="orb orb-4" />
            <span className="orb orb-5" />
          </div>

          <div style={{ display: page === "create" ? "contents" : "none" }}>
            <ErrorBoundary onReset={() => setStep(2)}>
              <Create
                step={step}
                setStep={setStep}
                activeToolId={activeToolId}
                setActiveToolId={setActiveToolId}
              />
            </ErrorBoundary>
          </div>

          {page === "library" && (
            <div className="page-container">
              <div className="page-header">
                <div className="page-header-titles">
                  <h1>{t.h}</h1>
                  <div className="sub">{t.sub}</div>
                </div>
              </div>
              <Library />
            </div>
          )}

          {page === "settings" && (
            <div className="page-container">
              <div className="page-header">
                <div className="page-header-titles">
                  <h1>{t.h}</h1>
                  <div className="sub">{t.sub}</div>
                </div>
              </div>
              <Settings />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
