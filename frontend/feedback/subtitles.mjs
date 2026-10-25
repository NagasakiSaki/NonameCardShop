// subtitles.mjs — 字幕条候选组件：为事件/台词提供非颜色、非音频的文本反馈通道。
// 只做展示；不产生业务副作用。挂载点候选：#stage 顶部（HUD 下），不遮挡交互提示。
import { TEXT_SPEED_MS } from "./feedback-prefs.mjs";

export function createSubtitleBar({ mount, prefs, reducedMotion = false, maxLines = 2 } = {}) {
  const bar = document.createElement("div");
  bar.className = "cv615-subtitles";
  bar.setAttribute("role", "status");
  bar.setAttribute("aria-live", "polite");
  bar.hidden = true;
  (mount || document.body).append(bar);

  const style = document.createElement("style");
  style.textContent = `
  .cv615-subtitles{position:absolute;left:50%;transform:translateX(-50%);bottom:12px;z-index:60;
    max-width:min(760px,86%);display:grid;gap:2px;pointer-events:none;
    font:13px/1.6 "Microsoft YaHei",sans-serif;color:#f6e6b8;
    background:rgba(14,11,20,0.92);border:1px solid rgba(232,182,74,0.35);border-radius:8px;padding:8px 14px}
  .cv615-subtitles .cv615-subtitle__speaker{font-weight:700;color:#e8b64a;margin-right:8px}`;
  style.textContent += '.cv615-subtitles[hidden]{display:none}';
  document.head.append(style);

  let hideTimer = null;
  let typeTimer = null;
  let destroyed = false;

  function clearTimers() { clearTimeout(hideTimer); clearInterval(typeTimer); }

  // show({speaker,text,durationMs}) — 纯文本，不执行 HTML。
  function show({ speaker = "", text = "", durationMs = 0 } = {}) {
    if (destroyed) return;
    clearTimers();
    if (!prefs.get().subtitles || !text) { bar.hidden = true; return; }
    bar.replaceChildren();
    const line = document.createElement("div");
    if (speaker) {
      const s = document.createElement("span");
      s.className = "cv615-subtitle__speaker";
      s.textContent = speaker; // textContent：文本不执行 HTML/JS（N09）
      line.append(s);
    }
    const body = document.createElement("span");
    line.append(body);
    bar.append(line);
    bar.hidden = false;

    const ms = prefs.textSpeedMs();
    if (reducedMotion || prefs.get().reducedMotion || ms <= 0) {
      body.textContent = text;
    } else {
      // 逐字显示（文字速度可调，U01）；跳过动画由 reducedMotion 或点击可提前完成。
      let i = 0;
      typeTimer = setInterval(() => {
        i += 1;
        body.textContent = text.slice(0, i);
        if (i >= text.length) clearInterval(typeTimer);
      }, ms);
    }
    hideTimer = setTimeout(() => { bar.hidden = true; }, durationMs || Math.max(2600, text.length * 160));
  }

  function hide() { clearTimers(); bar.hidden = true; }

  function destroy() { destroyed = true; clearTimers(); bar.remove(); style.remove(); }

  return { show, hide, destroy, get hidden() { return bar.hidden; }, maxLinesForTests: maxLines, TEXT_SPEED_MS };
}
