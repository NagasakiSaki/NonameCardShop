// frontend/ui/settings.mjs — 设置：前端偏好（本地前缀存储）与独立的开发配置区（提交经 Host 校验）。
import { el, clear, stateView, errorView, newRequestId, busyButton, imgWithFallback } from "./components.mjs";

const PREF_KEY = "noname-card-shop-frontend-preview:prefs";

function readPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREF_KEY) || "{}");
  } catch {
    return {};
  }
}

function writePrefs(prefs) {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
  } catch {
    // 隐私模式：只在本页生效
  }
}

export function applyPrefs() {
  const prefs = readPrefs();
  const root = document.documentElement;
  const scale = prefs.fontScale || "md";
  const sizes = { sm: { sm: "11px", md: "13px", lg: "15px" }, md: { sm: "12px", md: "14px", lg: "16px" }, lg: { sm: "14px", md: "16px", lg: "18px" } };
  const chosen = sizes[scale] || sizes.md;
  root.style.setProperty("--text-sm", chosen.sm);
  root.style.setProperty("--text-md", chosen.md);
  root.style.setProperty("--text-lg", chosen.lg);
  document.body.classList.toggle("reduce-motion", prefs.reduceMotion === true);
}

export async function openSettings(app) {
  return app.windows.open({
    id: "settings",
    title: "设置",
    subtitle: "营业速度、规则配置等业务参数由 Host 管理；这里只有前端偏好与开发配置入口",
    width: "window--wide",
    pauseReason: "打开设置",
    render: async (ctx) => {
      const body = ctx.body;
      const prefs=readPrefs(),skins=await ctx.query('player.skins');
      if(skins.ok)body.append(el('section',{class:'section'},[
        el('h4',{class:'section__title',text:'店长换装'}),
        el('p',{class:'small muted',text:'外观免费切换并随存档保存，只改变店长外形。'}),
        el('div',{class:'skin-grid'},skins.data.items.map(s=>el('button',{
          class:'skin-option'+(s.selected?' is-selected':''),type:'button','aria-label':'换装：'+s.name,'aria-pressed':String(s.selected),'data-skin':s.appearanceId,
          onclick:async event=>{const restore=busyButton(event.currentTarget,'换装中…');const r=await ctx.submit({requestId:newRequestId('skin'),type:'player.setSkin',payload:{appearanceId:s.appearanceId}});restore();if(!r.ok)app.toast('error',r.error.code,r.error.message);else {await app.refreshSnapshot();ctx.refresh();}}
        },[imgWithFallback(app.manifest.characters[s.appearanceId].portrait,s.name,'skin-option__portrait'),el('strong',{text:s.name}),el('span',{class:'small muted',text:s.selected?'当前穿着':'点击换装'})])))
      ]));

      body.append(el("div", { class: "section" }, [
        el("h4", { class: "section__title", text: "前端偏好" }),
        el("div", { class: "toolbar" }, [
          el("label", { class: "field" }, [
            el("span", { class: "field__label", text: "界面字号" }),
            el("select", {
              class: "select",
              onchange: (event) => {
                const next = { ...readPrefs(), fontScale: event.target.value };
                writePrefs(next);
                applyPrefs();
              },
            }, [
              el("option", { value: "sm", text: "小", selected: prefs.fontScale === "sm" }),
              el("option", { value: "md", text: "标准", selected: (!prefs.fontScale || prefs.fontScale === "md") }),
              el("option", { value: "lg", text: "大", selected: prefs.fontScale === "lg" }),
            ]),
          ]),
          el("label", { class: "field" }, [
            el("span", { class: "field__label", text: "画面缩放" }),
            el("select", {
              class: "select",
              onchange: (event) => {
                const next = { ...readPrefs(), zoom: event.target.value };
                writePrefs(next);
                app.applyZoomPreference();
              },
            }, [
              el("option", { value: "auto", text: "自动（完整店面）", selected: !prefs.zoom || prefs.zoom === "auto" }),
              el("option", { value: "1", text: "1×（最小）", selected: prefs.zoom === "1" }),
              el("option", { value: "2", text: "2×", selected: prefs.zoom === "2" }),
              el("option", { value: "3", text: "3×（最近）", selected: prefs.zoom === "3" }),
            ]),
          ]),
          el("label", { class: "field" }, [
            el("span", { class: "field__label", text: "音量（本阶段无音频，仅记录偏好）" }),
            el("input", {
              class: "input", type: "range", min: "0", max: "100", value: String(prefs.volume ?? 70), style: { width: "140px" },
              oninput: (event) => writePrefs({ ...readPrefs(), volume: Number(event.target.value) }),
            }),
          ]),
          el("label", { class: "field" }, [
            el("span", { class: "field__label", text: "降低动效" }),
            el("select", {
              class: "select",
              onchange: (event) => {
                const next = { ...readPrefs(), reduceMotion: event.target.value === "yes" };
                writePrefs(next);
                applyPrefs();
              },
            }, [
              el("option", { value: "no", text: "关闭" }),
              el("option", { value: "yes", text: "开启", selected: prefs.reduceMotion === true }),
            ]),
          ]),
          el("button", {
            class: "btn btn--sm", type: "button", text: "手动暂停 / 继续",
            onclick: async () => {
              const snapshot = app.snapshot();
              const paused = (snapshot.clock.pauseReasons || []).some((reason) => reason.code === "manual");
              const response = await ctx.submit({ requestId: newRequestId("pause"), type: "clock.setManualPause", payload: { paused: !paused } });
              if (!response.ok) {
                app.toast("error", response.error.code, response.error.message);
                return;
              }
              app.refreshSnapshot();
            },
          }),
          el("label", { class: "field" }, [
            el("span", { class: "field__label", text: "营业速度（业务参数）" }),
            el("select", {
              class: "select",
              onchange: async (event) => {
                const response = await ctx.submit({ requestId: newRequestId("speed"), type: "clock.setSpeed", payload: { speed: Number(event.target.value) } });
                if (!response.ok) app.toast("error", response.error.code, response.error.message);
                else app.refreshSnapshot();
              },
            }, [1, 2, 4].map((speed) => el("option", { value: String(speed), text: speed + "×", selected: app.snapshot().clock.speed === speed }))),
          ]),
        ]),
        el("p", { class: "small muted", text: "偏好存在本地键 " + PREF_KEY + "；不会触碰正式存档或浏览器全库。" }),
      ]));

      // 开发配置区
      const configSection = el("div", { class: "section" }, [el("h4", { class: "section__title", text: "开发配置（高级）" })]);
      body.append(configSection);
      const result = await ctx.query("config.list");
      if (!result.ok) {
        configSection.append(errorView(result.error, null));
      } else {
        configSection.append(el("p", { class: "small muted", text: "普通玩家流程里不展示模块内部结构；此处仅用于调试。草稿提交必须经 Host 校验。" }));
        for (const item of result.data.items) {
          const draft = el("textarea", {
            class: "input", rows: "5", style: { width: "100%", fontFamily: "ui-monospace, monospace" },
            value: item.text, disabled: !item.editable,
          });
          draft.value = item.text;
          const status = el("p", { class: "small muted", text: "" });
          configSection.append(el("div", { class: "note-card" }, [
            el("p", { class: "note-card__title" }, [item.label, el("span", { class: "chip", text: item.editable ? "可编辑" : "只读" })]),
            draft,
            status,
            el("div", { style: { display: "flex", gap: "6px" } }, [
              el("button", {
                class: "btn btn--sm", type: "button", text: "校验", disabled: !item.editable,
                onclick: async () => {
                  const check = await ctx.query("config.validate", { configId: item.configId, draft: draft.value });
                  status.textContent = check.ok && check.data.valid ? "校验通过" : "校验失败：" + (check.error?.message || (check.data?.errors||[{}])[0].message || "未知错误");
                  status.style.color = check.ok && check.data.valid ? "#a6d6a9" : "#f0a08a";
                },
              }),
              el("button", {
                class: "btn btn--sm btn--primary", type: "button", text: "提交", disabled: !item.editable,
                onclick: async () => {
                  const response = await ctx.submit({ requestId: newRequestId("config"), type: "config.apply", payload: { configId: item.configId, draft: draft.value } });
                  if (!response.ok) {
                    status.textContent = "提交失败：" + response.error.message;
                    status.style.color = "#f0a08a";
                    return;
                  }
                  status.textContent = "已应用（Host 校验通过）";
                  status.style.color = "#a6d6a9";
                },
              }),
              el("button", {
                class: "btn btn--sm btn--ghost", type: "button", text: "恢复默认", disabled: !item.editable,
                onclick: async () => {
                  const response = await ctx.submit({ requestId: newRequestId("config"), type: "config.restoreDefault", payload: { configId: item.configId } });
                  if (response.ok) {
                    status.textContent = "已恢复默认值";
                    ctx.refresh();
                  }
                },
              }),
            ]),
          ]));
        }
      }

      ctx.setFooter([el("button", { class: "btn btn--ghost", type: "button", text: "关闭", onclick: () => ctx.handle.close() })]);
    },
  });
}
