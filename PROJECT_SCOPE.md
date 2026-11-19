# ClipForge — Project Scope & Future Roadmap

This document outlines architectural decisions, technical specifications, and future upgrade paths for ClipForge — especially for non-technical end users.

---

## 1. Current Architecture (v1.0)

### 1.1 Speech-to-Text & Timestamps
- **Engine:** `faster-whisper` (CTranslate2 backend)
- **Model:** `large-v3-turbo` (~1.6 GB)
  - Features 4 decoder layers instead of 32.
  - Achieves near-identical accuracy to `large-v3` at ~6x speed on CPU.
  - Provides exact word-level timestamps used for precise video cutting and subtitle synchronization.
- **Hardware Optimization:**
  - Auto-detects Apple Silicon / Intel CPU / NVIDIA CUDA GPU.
  - On Intel Macs (CPU mode), quantization is set to `int8` with multi-threading to ensure stable performance.

### 1.2 Virality Scoring & Candidate Selection
- **Current Mode:** Fully local mathematical & linguistic heuristic in `app/selector.py`.
- **Signals Evaluated:**
  1. **Energy & Word Density ($2.0\times$):** Rewards fast-paced, high-engagement speech (~3 words/sec). Filters out dead air and filler.
  2. **Hook & Curiosity ($1.5\times$):** Detects psychological curiosity triggers (`"secret"`, `"mistake"`, `"truth"`, `"why"`, `"how"`) and questions (`?`).
  3. **Sentence & Thought Completeness ($1.5\times$):** Prioritizes segments ending on clean terminal punctuation.
  4. **Target Length Fit ($1.0\times$):** Rewards clips that match the user's requested average length.
  5. **Topic Shift Detection:** Evaluates vocabulary overlap (<25%) and pause gaps ($\ge 0.6\text{s}$) to avoid cutting speakers mid-thought.

---

## 2. Future Update Scope: Local LLM AI Virality Engine (Llama 3.2:3b)

For future releases, ClipForge will offer an optional, automated Local LLM upgrade using **Meta Llama 3.2:3b** to evaluate transcript storylines, detect humor/sarcasm, and generate viral hook titles.

### 2.1 Target User Persona
- **Non-technical consumer:** Users should **never** need to use terminal commands, Homebrew, or manual environment variables. Everything must be managed transparently by the app.

### 2.2 Automated Background Architecture
1. **Ollama Daemon Management:**
   - Detect whether Ollama is installed on system paths (`/usr/local/bin/ollama`, `/opt/homebrew/bin/ollama`, or bundled with ClipForge application packages).
   - In macOS desktop packaging (DMG/App), bundle the headless `ollama` runtime inside `ClipForge.app/Contents/Resources/bin/ollama`.
   - On application startup, ClipForge checks if the daemon is running on `http://localhost:11434`. If not, it spawns `ollama serve` as a supervised child process.

2. **Zero-Friction In-App Model Pulling:**
   - In **Settings** (or an in-app prompt), provide a 1-click toggle: **"Enable Deep AI Virality Analysis (Llama 3.2:3b)"**.
   - When clicked, ClipForge calls Ollama's REST API:
     ```http
     POST http://localhost:11434/api/pull
     Content-Type: application/json

     {
       "name": "llama3.2:3b",
       "stream": true
     }
     ```
   - Stream the JSON progress chunks (`completed`, `total`) to display a live in-app download progress bar.

3. **LLM Prompting & Scoring Pipeline:**
   - Whisper extracts transcript candidate windows.
   - Pre-rank top candidates using the lightweight heuristic to minimize CPU load.
   - Pass candidates to `llama3.2:3b` with a structured system prompt:
     ```
     You are an expert social media short-form video editor (TikTok, Reels, Shorts).
     Analyze this transcript excerpt from a longer video.
     Rate its viral potential from 0 to 100 based on hook strength, emotional resonance, and clarity.
     Write a punchy hook title (under 8 words).
     Reply ONLY with valid JSON:
     {"score": <int>, "hook_title": "<string>", "reason": "<string>"}
     ```
   - Parse JSON response and combine LLM score with duration/audio signals.

4. **Graceful Degradation:**
   - If Ollama is unavailable, terminated, or low on system memory, ClipForge silently falls back to the native mathematical heuristic without interrupting the user.

---

## 3. UI/UX Workflow Milestones

1. **Step 1 (Source):** Import video via URL or local file upload.
2. **Step 2 (Clip Configuration):**
   - **Average Clip Length:** User chooses target duration (`30s`, `45s`, `60s`, or `Custom`).
   - **Number of Clips:** User specifies how many highlights they want.
   - **Duration Capacity Estimator:** Live calculation of maximum possible clips based on video length.
   - **Aspect Ratio:** Choose between 9:16 Vertical, 1:1 Square, or 16:9 Landscape.
3. **Step 3 (Captions & Styles):** Style presets, font selection, and animation effects.
4. **Step 4 (Music & Watermark):** Background audio ducking and branding.
5. **Step 5 (Review & Export):** View generated clips, adjust AI crop reframing, and export.
