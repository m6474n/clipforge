import { useState, useEffect } from "react";
import { Icons } from "./Icons.jsx";
import { TOOLS, TOOL_CATEGORIES } from "../toolsConfig.js";

export default function ToolsDrawer({
  isOpen,
  onClose,
  activeToolId,
  onSelectTool,
  online,
  device,
}) {
  const [search, setSearch] = useState("");

  // Close drawer on Escape key
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filteredTools = search.trim()
    ? TOOLS.filter(
        (t) =>
          t.name.toLowerCase().includes(search.toLowerCase()) ||
          t.desc.toLowerCase().includes(search.toLowerCase()) ||
          t.shortName.toLowerCase().includes(search.toLowerCase())
      )
    : TOOLS;

  return (
    <div className="tools-drawer-overlay">
      <div className="tools-drawer-scrim" onClick={onClose} aria-hidden="true" />
      <aside className="tools-drawer" role="dialog" aria-modal="true" aria-label="Tools Navigation Drawer">
        <div className="tools-drawer-head">
          <div className="tools-drawer-brand">
            <span className="logo"><Icons.bolt /></span>
            <div className="brand-text">
              <span>ClipForge Tools</span>
              <span className="brand-by">Multi-Tool Studio</span>
            </div>
          </div>
          <button className="tools-drawer-close" onClick={onClose} aria-label="Close drawer">
            <Icons.close />
          </button>
        </div>

        <div className="tools-drawer-search">
          <input
            type="text"
            placeholder="Search tools & tabs…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        <div className="tools-drawer-body">
          {TOOL_CATEGORIES.map((cat) => {
            const catTools = filteredTools.filter((t) => t.category === cat.id);
            if (catTools.length === 0) return null;

            return (
              <div key={cat.id} className="tools-drawer-group">
                <div className="tools-drawer-cat-title">{cat.label}</div>
                <div className="tools-drawer-items">
                  {catTools.map((tool) => {
                    const IconComp = tool.icon;
                    const isActive = activeToolId === tool.id;

                    return (
                      <button
                        key={tool.id}
                        className={"tools-drawer-card" + (isActive ? " active" : "")}
                        onClick={() => {
                          onSelectTool(tool);
                          onClose();
                        }}
                      >
                        <div className="tools-drawer-card-icon">
                          <IconComp />
                        </div>
                        <div className="tools-drawer-card-content">
                          <div className="tools-drawer-card-top">
                            <span className="tools-drawer-card-title">{tool.name}</span>
                            {tool.badge && (
                              <span className="tools-drawer-badge">{tool.badge}</span>
                            )}
                          </div>
                          <div className="tools-drawer-card-desc">{tool.desc}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className="tools-drawer-group">
            <div className="tools-drawer-cat-title">Developer & Extensibility</div>
            <div className="tools-drawer-add-slot">
              <div className="add-slot-icon"><Icons.plus /></div>
              <div>
                <strong>Add New Tools Easily</strong>
                <p>Register new modules in <code>web/src/toolsConfig.js</code> to auto-render tabs and drawer items.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="tools-drawer-foot">
          <div className="tools-drawer-engine-badge">
            <span className="dot" style={{ background: online ? "var(--ok, #22c55e)" : "var(--danger, #ef4444)" }} />
            <span>{online ? `Local Engine: ${(device || "ready").toUpperCase()}` : "Engine Offline"}</span>
          </div>
          <div className="tools-drawer-foot-note">
            100% On-Device · No External APIs
          </div>
        </div>
      </aside>
    </div>
  );
}

