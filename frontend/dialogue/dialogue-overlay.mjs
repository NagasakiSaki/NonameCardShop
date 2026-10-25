// V7-E dialogue/dialogue-overlay.mjs — 世界内底部对话框 DOM 组件。
// 规则（任务书 §1 / 01-冻结玩法 §7）：
// - 场景保留在后方，只有底部覆盖层；桌面宽=min(960px, 视口-32)、高200~260；
//   移动端宽-16、高≤45% 可视高度；正文18px（窄屏16）、姓名20px（窄屏18）、选项触达≥44px。
// - 呈现期间阻断世界点击；键盘 Esc=延期（挑战=tomorrow），Enter=推进正文，数字键=选项；
//   处理过的按键 stopImmediatePropagation，避免同键穿透成接战/关窗。
// - 不自带业务：所有 respond/dismiss 通过 onIntent 上抛，由 shell 走 adapter。

import { currentChoices, choicePageCount, textDone, prevChoicePage, nextChoicePage } from "./dialogue-presenter.mjs";
import { el } from "../world/dom-helpers.mjs";

const KEY_HANDLED = new Set(["Escape", "Enter", " ", "ArrowUp", "ArrowDown", "1", "2", "3"]);

export function createDialogueOverlay({ mount, onIntent, getPortraitSrc }) {
  const root = el("div", { class: "v7-dialogue-root", hidden: true });
  const box = el("section", { class: "v7-dialogue", role: "dialog", "aria-modal": "true", "aria-label": "场景对话", dataset: { v7Dialogue: "true" } });
  const portraitWrap = el("div", { class: "v7-dialogue__portrait" });
  const body = el("div", { class: "v7-dialogue__body" });
  const nameRow = el("div", { class: "v7-dialogue__name-row" });
  const textNode = el("p", { class: "v7-dialogue__text" });
  const choiceRow = el("div", { class: "v7-dialogue__choices" });
  const pagerRow = el("div", { class: "v7-dialogue__pager" });
  const closeBtn = el("button", { class: "v7-dialogue__close", type: "button", text: "×", title: "关闭（Esc，挑战邀请按改天处理）", "aria-label": "关闭对话" });
  body.append(nameRow, textNode, choiceRow, pagerRow);
  box.append(portraitWrap, body, closeBtn);
  root.append(box);
  mount.append(root);

  let presentation = null;
  let active = false;
  let choiceFocus = 0;
  const keyHandler = (event) => {
    if (!active) return;
    if (!KEY_HANDLED.has(event.key)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.key === "Escape") emitIntent({ type: "dismiss", reason: "esc" });
    else if (event.key === "Enter" || event.key === " ") {
      if (!textDone(presentation)) emitIntent({ type: "advance" });
      else pickFocused();
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      const choices = currentChoices(presentation).filter((c) => c.available !== false);
      if (!choices.length) return;
      choiceFocus = (choiceFocus + (event.key === "ArrowDown" ? 1 : choices.length - 1)) % choices.length;
      renderChoices();
    } else {
      const index = Number(event.key) - 1;
      const choices = currentChoices(presentation).filter((c) => c.available !== false);
      const choice = choices[index];
      if (choice) emitIntent({ type: "respond", optionId: choice.optionId });
    }
  };

  function emitIntent(intent) {
    if (typeof onIntent === "function") onIntent(intent, { presentation });
  }

  function pickFocused() {
    const choices = currentChoices(presentation).filter((c) => c.available !== false);
    const choice = choices[choiceFocus];
    if (choice) emitIntent({ type: "respond", optionId: choice.optionId });
    else emitIntent({ type: "advance" });
  }

  function renderChoices() {
    choiceRow.replaceChildren();
    pagerRow.replaceChildren();
    const choices = currentChoices(presentation || { textPages: [""], textIndex: 0, choicePages: [], choiceIndex: 0 });
    if (!textDone(presentation) || !choices.length) return;
    choices.forEach((choice, index) => {
      const button = el("button", {
        class: "v7-dialogue__choice" + (choice.available === false ? " v7-dialogue__choice--off" : "") + (index === choiceFocus ? " is-focus" : ""),
        type: "button",
        text: choice.text,
        disabled: choice.available === false,
        dataset: { optionId: choice.optionId },
        onclick: () => emitIntent({ type: "respond", optionId: choice.optionId }),
      });
      choiceRow.append(button);
    });
    const pages = choicePageCount(presentation);
    if (pages > 1) {
      pagerRow.append(
        el("button", { class: "v7-dialogue__page", type: "button", text: "上一页", onclick: () => { presentation && prevChoicePage(presentation); choiceFocus = 0; renderChoices(); } }),
        el("span", { class: "v7-dialogue__page-indicator", text: `${presentation.choiceIndex + 1}/${pages}` }),
        el("button", { class: "v7-dialogue__page", type: "button", text: "下一页", onclick: () => { presentation && nextChoicePage(presentation); choiceFocus = 0; renderChoices(); } }),
      );
    }
  }

  function render() {
    if (!presentation) return;
    nameRow.replaceChildren();
    const nameNode = el("strong", { class: "v7-dialogue__name", text: presentation.speakerName });
    if (presentation.nameColor) nameNode.style.color = presentation.nameColor;
    nameRow.append(nameNode);
    if (presentation.roleLabel) nameRow.append(el("span", { class: "v7-dialogue__role", text: presentation.roleLabel }));
    textNode.textContent = presentation.textPages[presentation.textIndex];
    portraitWrap.replaceChildren();
    const src = getPortraitSrc ? getPortraitSrc(presentation.portrait) : presentation.portrait;
    if (src) portraitWrap.append(el("img", { class: "v7-dialogue__portrait-img", src, alt: presentation.speakerName }));
    choiceRow.replaceChildren();
    if (textDone(presentation)) {
      choiceFocus = 0;
      renderChoices();
      if (!presentation.choicePages.length) pagerRow.replaceChildren(el("button", { class: "v7-dialogue__page", type: "button", text: "结束", onclick: () => emitIntent({ type: "dismiss", reason: "completed" }) }));
    } else {
      pagerRow.replaceChildren(
        el("span", { class: "v7-dialogue__page-indicator", text: `${presentation.textIndex + 1}/${presentation.textPages.length}` }),
        el("button", { class: "v7-dialogue__page", type: "button", text: "继续 ▸", onclick: () => emitIntent({ type: "advance" }) }),
      );
    }
  }

  function present(next) {
    presentation = next;
    choiceFocus = 0;
    if (!active) {
      active = true;
      root.hidden = false;
      window.addEventListener("keydown", keyHandler, true);
      requestAnimationFrame(() => box.classList.add("is-open"));
    }
    render();
  }

  function close() {
    if (!active) return;
    active = false;
    window.removeEventListener("keydown", keyHandler, true);
    box.classList.remove("is-open");
    root.hidden = true;
    presentation = null;
  }

  closeBtn.addEventListener("click", () => emitIntent({ type: "dismiss", reason: "close" }));

  return {
    present,
    close,
    get active() { return active; },
    get presentation() { return presentation; },
    destroy() { close(); root.remove(); },
  };
}
