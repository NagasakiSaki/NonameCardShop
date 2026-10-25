// V7-E dialogue/dialogue-presenter.mjs — 对话视图模型与分页（纯函数）。
// 规则（01-冻结玩法 §7）：选项每页最多 3 条；正文自适应分页，不滚动堆满；
// 先翻完正文再出现选项；姓名/正文/选项字号由 CSS 负责，这里只决定内容切片。

export const MAX_CHOICES_PER_PAGE = 3;

/** 把正文切成若干页；保留换行，绝不把词切进滚动区。 */
export function paginateText(text, charsPerPage = 90) {
  const source = String(text ?? "");
  if (!source) return [""];
  const per = Math.max(20, Math.floor(charsPerPage));
  const paragraphs = source.split(/\n/);
  const pages = [];
  let current = "";
  const push = () => {
    if (current) pages.push(current);
    current = "";
  };
  for (const paragraph of paragraphs) {
    if (paragraph.length <= per - (current ? current.length + 1 : 0)) {
      current = current ? current + "\n" + paragraph : paragraph;
      if (current.length === per) push();
      continue;
    }
    let rest = paragraph;
    if (current) {
      const take = per - current.length - 1;
      if (take > 0) {
        current += "\n" + rest.slice(0, take);
        rest = rest.slice(take);
      }
      push();
    }
    while (rest.length > per) {
      pages.push(rest.slice(0, per));
      rest = rest.slice(per);
    }
    if (rest) current = rest;
  }
  push();
  return pages.length ? pages : [""];
}

/** 选项分页，每页最多 3 条。 */
export function paginateChoices(choices, maxPerPage = MAX_CHOICES_PER_PAGE) {
  const list = (choices || []).filter(Boolean);
  const per = Math.max(1, maxPerPage);
  const pages = [];
  for (let i = 0; i < list.length; i += per) pages.push(list.slice(i, i + per));
  return pages;
}

/**
 * 创建呈现状态。offer 为 dialogue.offer 的只读 DTO（与 V7-B buildDialogueOffer 同形）。
 * charsPerPage 由 shell 按容器实测传入（窄屏更小）。
 */
export function createPresentation(offer, { charsPerPage = 90 } = {}) {
  const textPages = paginateText(offer.text, charsPerPage);
  // 选项保持 DTO 原顺序（可用与不可用都在原位，分页稳定可预期）。
  const orderedChoices = (offer.choices || []).filter(Boolean);
  return {
    offerId: offer.offerId,
    inviteId: offer.inviteId || null,
    source: offer.source || "talk",
    speakerName: offer.speakerName || "陌生人",
    nameColor: offer.nameColor || null,
    roleLabel: offer.roleLabel || null,
    portrait: offer.appearanceId || offer.portrait || null,
    textPages,
    textIndex: 0,
    choicePages: paginateChoices(orderedChoices),
    choiceIndex: 0,
    proof: offer.proof || null,
    consumed: false,
  };
}

export function textDone(presentation) {
  return presentation.textIndex >= presentation.textPages.length - 1;
}

/** 前进一条正文；正文翻完返回 false（此时应显示选项）。 */
export function advanceText(presentation) {
  if (textDone(presentation)) return false;
  presentation.textIndex += 1;
  return true;
}

export function currentChoices(presentation) {
  if (!textDone(presentation) || !presentation.choicePages.length) return [];
  return presentation.choicePages[presentation.choiceIndex] || [];
}

export function choicePageCount(presentation) {
  return presentation.choicePages.length;
}

export function nextChoicePage(presentation) {
  if (presentation.choiceIndex >= presentation.choicePages.length - 1) return false;
  presentation.choiceIndex += 1;
  return true;
}

export function prevChoicePage(presentation) {
  if (presentation.choiceIndex <= 0) return false;
  presentation.choiceIndex -= 1;
  return true;
}

/** 消费一个选项：只允许当前页已显示的 optionId，单次有效。 */
export function chooseOption(presentation, optionId) {
  if (presentation.consumed) return { ok: false, error: { code: "INVITE_STALE", message: "该邀请已被处理", retryable: false } };
  const visible = currentChoices(presentation).find((choice) => choice.optionId === optionId);
  if (!visible) return { ok: false, error: { code: "INVALID_OPTION", message: "该选项不在当前页", retryable: false } };
  if (visible.available === false) return { ok: false, error: { code: "OPTION_UNAVAILABLE", message: visible.reason || "该选项当前不可用", retryable: false } };
  presentation.consumed = true;
  return { ok: true, option: visible };
}
