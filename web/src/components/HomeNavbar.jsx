import { Icons } from "./Icons.jsx";
import { TOOLS } from "../toolsConfig.js";

export default function HomeNavbar({
  activeToolId,
  onSelectTool,
  onOpenDrawer,
  theme,
  setTheme,
  online,
  device,
}) {
  return (
    <header className="home-navbar">
      <div className="home-navbar-left">
        <button
          className="home-drawer-toggle-btn"
          onClick={onOpenDrawer}
          title="Open Tools Drawer"
          aria-label="Open Tools Drawer"
        >
          <Icons.menu />
          <span className="drawer-btn-label">Tools</span>
          <span className="drawer-btn-count">{TOOLS.length}</span>
        </button>

        <div className="home-navbar-brand">
          <span className="logo"><Icons.bolt /></span>
          <span className="brand-text">
            ClipForge
            <span className="brand-by">by Mosen</span>
          </span>
        </div>
      </div>

      <nav className="home-navbar-tabs" aria-label="Tool options">
        {TOOLS.map((tool) => {
          const IconComp = tool.icon;
          const isActive = activeToolId === tool.id;

          return (
            <button
              key={tool.id}
              className={"home-tool-tab" + (isActive ? " active" : "")}
              onClick={() => onSelectTool(tool)}
              title={tool.desc}
            >
              <span className="tab-icon"><IconComp /></span>
              <span className="tab-label">{tool.shortName}</span>
              {tool.badge && <span className="tab-badge">{tool.badge}</span>}
            </button>
          );
        })}
      </nav>

      <div className="home-navbar-right">
        <div className="home-theme-wrap" role="group" aria-label="Theme">
          <button
            className={theme === "dark" ? "active" : ""}
            onClick={() => setTheme("dark")}
            title="Dark theme"
          >
            Dark
          </button>
          <button
            className={theme === "light" ? "active" : ""}
            onClick={() => setTheme("light")}
            title="Light theme"
          >
            Light
          </button>
        </div>

        <span className={"badge " + (online ? "ok" : online === false ? "warn" : "")}>
          <span className="dot" />
          <span className="badge-text">
            {online == null ? "Connecting…" : online ? `Local · ${(device || "ready").toUpperCase()}` : "Offline"}
          </span>
        </span>
      </div>
    </header>
  );
}

