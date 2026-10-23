import Y from "electron";
var F = typeof globalThis < "u" ? globalThis : typeof window < "u" ? window : typeof global < "u" ? global : typeof self < "u" ? self : {}, B = {}, L = {}, W = {}, D;
function ae() {
  if (D) return W;
  D = 1, Object.defineProperty(W, "__esModule", { value: !0 }), W.CallbacksRegistry = void 0;
  class c {
    constructor() {
      this.nextId = 0, this.callbacks = {}, this.callbackIds = /* @__PURE__ */ new WeakMap(), this.locationInfo = /* @__PURE__ */ new WeakMap();
    }
    add(a) {
      let o = this.callbackIds.get(a);
      if (o != null)
        return o;
      o = this.nextId += 1, this.callbacks[o] = a, this.callbackIds.set(a, o);
      const l = /at (.*)/gi, p = new Error().stack;
      if (!p)
        return o;
      let g, O;
      for (; (O = l.exec(p)) !== null; ) {
        const E = O[1];
        if (E.includes("(native)") || E.includes("(<anonymous>)") || E.includes("callbacks-registry.js") || E.includes("remote.js") || E.includes("@electron/remote/dist"))
          continue;
        const t = /([^/^)]*)\)?$/gi.exec(E);
        t && (g = t[1]);
        break;
      }
      return this.locationInfo.set(a, g), o;
    }
    get(a) {
      return this.callbacks[a] || function() {
      };
    }
    getLocation(a) {
      return this.locationInfo.get(a);
    }
    apply(a, ...o) {
      return this.get(a).apply(F, ...o);
    }
    remove(a) {
      const o = this.callbacks[a];
      o && (this.callbackIds.delete(o), delete this.callbacks[a]);
    }
  }
  return W.CallbacksRegistry = c, W;
}
var S = {}, V;
function le() {
  if (V) return S;
  V = 1, Object.defineProperty(S, "__esModule", { value: !0 }), S.deserialize = S.serialize = S.isSerializableObject = S.isPromise = void 0;
  const c = Y;
  function y(t) {
    return t && t.then && t.then instanceof Function && t.constructor && t.constructor.reject && t.constructor.reject instanceof Function && t.constructor.resolve && t.constructor.resolve instanceof Function;
  }
  S.isPromise = y;
  const a = [
    Boolean,
    Number,
    String,
    Date,
    Error,
    RegExp,
    ArrayBuffer
  ];
  function o(t) {
    return t === null || ArrayBuffer.isView(t) || a.some((m) => t instanceof m);
  }
  S.isSerializableObject = o;
  const l = function(t, m) {
    const b = Object.entries(t).map(([w, M]) => [w, m(M)]);
    return Object.fromEntries(b);
  };
  function p(t) {
    const m = [], h = t.getScaleFactors();
    if (h.length === 1) {
      const b = h[0], w = t.getSize(b), M = t.toBitmap({ scaleFactor: b });
      m.push({ scaleFactor: b, size: w, buffer: M });
    } else
      for (const b of h) {
        const w = t.getSize(b), M = t.toDataURL({ scaleFactor: b });
        m.push({ scaleFactor: b, size: w, dataURL: M });
      }
    return { __ELECTRON_SERIALIZED_NativeImage__: !0, representations: m };
  }
  function g(t) {
    const m = c.nativeImage.createEmpty();
    if (t.representations.length === 1) {
      const { buffer: h, size: b, scaleFactor: w } = t.representations[0], { width: M, height: f } = b;
      m.addRepresentation({ buffer: h, scaleFactor: w, width: M, height: f });
    } else
      for (const h of t.representations) {
        const { dataURL: b, size: w, scaleFactor: M } = h, { width: f, height: P } = w;
        m.addRepresentation({ dataURL: b, scaleFactor: M, width: f, height: P });
      }
    return m;
  }
  function O(t) {
    return t && t.constructor && t.constructor.name === "NativeImage" ? p(t) : Array.isArray(t) ? t.map(O) : o(t) ? t : t instanceof Object ? l(t, O) : t;
  }
  S.serialize = O;
  function E(t) {
    return t && t.__ELECTRON_SERIALIZED_NativeImage__ ? g(t) : Array.isArray(t) ? t.map(E) : o(t) ? t : t instanceof Object ? l(t, E) : t;
  }
  return S.deserialize = E, S;
}
var z = {}, N = {}, K;
function J() {
  if (K) return N;
  K = 1, Object.defineProperty(N, "__esModule", { value: !0 }), N.getElectronBinding = void 0;
  const c = (y) => process._linkedBinding ? process._linkedBinding("electron_common_" + y) : process.electronBinding ? process.electronBinding(y) : null;
  return N.getElectronBinding = c, N;
}
var X;
function de() {
  return X || (X = 1, (function(c) {
    var y, a;
    Object.defineProperty(c, "__esModule", { value: !0 }), c.browserModuleNames = c.commonModuleNames = void 0;
    const o = J();
    c.commonModuleNames = [
      "clipboard",
      "nativeImage",
      "shell"
    ], c.browserModuleNames = [
      "app",
      "autoUpdater",
      "BaseWindow",
      "BrowserView",
      "BrowserWindow",
      "contentTracing",
      "crashReporter",
      "dialog",
      "globalShortcut",
      "ipcMain",
      "inAppPurchase",
      "Menu",
      "MenuItem",
      "nativeTheme",
      "net",
      "netLog",
      "MessageChannelMain",
      "Notification",
      "powerMonitor",
      "powerSaveBlocker",
      "protocol",
      "pushNotifications",
      "safeStorage",
      "screen",
      "session",
      "ServiceWorkerMain",
      "ShareMenu",
      "systemPreferences",
      "TopLevelWindow",
      "TouchBar",
      "Tray",
      "utilityProcess",
      "View",
      "webContents",
      "WebContentsView",
      "webFrameMain"
    ].concat(c.commonModuleNames);
    const l = o.getElectronBinding("features");
    ((y = l?.isDesktopCapturerEnabled) === null || y === void 0 ? void 0 : y.call(l)) !== !1 && c.browserModuleNames.push("desktopCapturer"), ((a = l?.isViewApiEnabled) === null || a === void 0 ? void 0 : a.call(l)) !== !1 && c.browserModuleNames.push("ImageView");
  })(z)), z;
}
var H;
function fe() {
  return H || (H = 1, (function(c) {
    Object.defineProperty(c, "__esModule", { value: !0 }), c.createFunctionWithReturnValue = c.getGlobal = c.getCurrentWebContents = c.getCurrentWindow = c.getBuiltin = void 0;
    const y = ae(), a = le(), o = Y, l = de(), p = J(), { Promise: g } = F, O = new y.CallbacksRegistry(), E = /* @__PURE__ */ new Map(), t = new FinalizationRegistry((e) => {
      const n = E.get(e);
      n !== void 0 && n.deref() === void 0 && (E.delete(e), o.ipcRenderer.send("REMOTE_BROWSER_DEREFERENCE", f, e, 0));
    }), m = /* @__PURE__ */ new WeakMap(), h = /* @__PURE__ */ new WeakSet();
    function b(e) {
      const n = E.get(e);
      if (n !== void 0) {
        const i = n.deref();
        if (i !== void 0)
          return i;
      }
    }
    function w(e, n) {
      const i = new WeakRef(n);
      return E.set(e, i), t.register(n, e), n;
    }
    function M() {
      const e = p.getElectronBinding("v8_util");
      if (e)
        return e.getHiddenValue(F, "contextId");
      throw new Error("Electron >=v13.0.0-beta.6 required to support sandboxed renderers");
    }
    const f = process.contextId || M();
    process.on("exit", () => {
      o.ipcRenderer.send("REMOTE_BROWSER_CONTEXT_RELEASE", f);
    });
    const P = /* @__PURE__ */ Symbol("is-remote-proxy");
    function k(e, n = /* @__PURE__ */ new Set()) {
      const i = (r) => {
        if (n.has(r))
          return {
            type: "value",
            value: null
          };
        if (r && r.constructor && r.constructor.name === "NativeImage")
          return { type: "nativeimage", value: a.serialize(r) };
        if (Array.isArray(r)) {
          n.add(r);
          const s = {
            type: "array",
            value: k(r, n)
          };
          return n.delete(r), s;
        } else {
          if (r instanceof Buffer)
            return {
              type: "buffer",
              value: r
            };
          if (a.isSerializableObject(r))
            return {
              type: "value",
              value: r
            };
          if (typeof r == "object") {
            if (a.isPromise(r))
              return {
                type: "promise",
                then: i(function(u, d) {
                  r.then(u, d);
                })
              };
            if (m.has(r))
              return {
                type: "remote-object",
                id: m.get(r)
              };
            const s = {
              type: "object",
              name: r.constructor ? r.constructor.name : "",
              members: []
            };
            n.add(r);
            for (const u in r)
              s.members.push({
                name: u,
                value: i(r[u])
              });
            return n.delete(r), s;
          } else return typeof r == "function" && h.has(r) ? {
            type: "function-with-return-value",
            value: i(r())
          } : typeof r == "function" ? {
            type: "function",
            id: O.add(r),
            location: O.getLocation(r),
            length: r.length
          } : {
            type: "value",
            value: r
          };
        }
      };
      return e.map(i);
    }
    function A(e, n, i, r) {
      if (Array.isArray(r))
        for (const s of r) {
          if (Object.prototype.hasOwnProperty.call(n, s.name))
            continue;
          const u = { enumerable: s.enumerable };
          if (s.type === "method") {
            const d = function(...j) {
              let C;
              this && this.constructor === d ? C = "REMOTE_BROWSER_MEMBER_CONSTRUCTOR" : C = "REMOTE_BROWSER_MEMBER_CALL";
              const ue = o.ipcRenderer.sendSync(C, f, i, s.name, k(j));
              return _(ue);
            };
            let R = $(d, i, s.name);
            u.get = () => (R.ref = e, R), u.set = (j) => (R = j, j), u.configurable = !0;
          } else s.type === "get" && (u.get = () => {
            const R = o.ipcRenderer.sendSync("REMOTE_BROWSER_MEMBER_GET", f, i, s.name);
            return _(R);
          }, s.writable && (u.set = (d) => {
            const R = k([d]), C = o.ipcRenderer.sendSync("REMOTE_BROWSER_MEMBER_SET", f, i, s.name, R);
            return C != null && _(C), d;
          }));
          Object.defineProperty(n, s.name, u);
        }
    }
    function v(e, n, i, r) {
      if (r === null)
        return;
      const s = {};
      A(e, s, i, r.members), v(e, s, i, r.proto), Object.setPrototypeOf(n, s);
    }
    function $(e, n, i) {
      let r = !1;
      const s = () => {
        if (r)
          return;
        r = !0;
        const d = o.ipcRenderer.sendSync("REMOTE_BROWSER_MEMBER_GET", f, n, i);
        A(e, e, d.id, d.members);
      };
      return new Proxy(e, {
        set: (u, d, R) => (d !== "ref" && s(), u[d] = R, !0),
        get: (u, d) => {
          if (d === P)
            return !0;
          Object.prototype.hasOwnProperty.call(u, d) || s();
          const R = u[d];
          return d === "toString" && typeof R == "function" ? R.bind(u) : R;
        },
        ownKeys: (u) => (s(), Object.getOwnPropertyNames(u)),
        getOwnPropertyDescriptor: (u, d) => {
          const R = Object.getOwnPropertyDescriptor(u, d);
          return R || (s(), Object.getOwnPropertyDescriptor(u, d));
        }
      });
    }
    function _(e) {
      if (!e)
        return {};
      if (e.type === "value")
        return e.value;
      if (e.type === "array")
        return e.members.map((n) => _(n));
      if (e.type === "nativeimage")
        return a.deserialize(e.value);
      if (e.type === "buffer")
        return Buffer.from(e.value.buffer, e.value.byteOffset, e.value.byteLength);
      if (e.type === "promise")
        return g.resolve({ then: _(e.then) });
      if (e.type === "error")
        return U(e);
      if (e.type === "exception")
        throw e.value.type === "error" ? U(e.value) : new Error(`Unexpected value type in exception: ${e.value.type}`);
      {
        let n;
        if ("id" in e) {
          const i = b(e.id);
          if (i !== void 0)
            return i;
        }
        if (e.type === "function") {
          const i = function(...r) {
            let s;
            this && this.constructor === i ? s = "REMOTE_BROWSER_CONSTRUCTOR" : s = "REMOTE_BROWSER_FUNCTION_CALL";
            const u = o.ipcRenderer.sendSync(s, f, e.id, k(r));
            return _(u);
          };
          n = i;
        } else
          n = {};
        return A(n, n, e.id, e.members), v(n, n, e.id, e.proto), n.constructor && n.constructor[P] && Object.defineProperty(n.constructor, "name", { value: e.name }), m.set(n, e.id), w(e.id, n), n;
      }
    }
    function U(e) {
      const n = e.value;
      for (const { name: i, value: r } of e.members)
        n[i] = _(r);
      return n;
    }
    function ee(e) {
      return typeof e.senderId == "number";
    }
    function G(e, n) {
      o.ipcRenderer.on(e, (i, r, s, ...u) => {
        if (ee(i) && i.senderId !== 0 && i.senderId !== void 0) {
          console.error(`Message ${e} sent by unexpected WebContents (${i.senderId})`);
          return;
        }
        r === f ? n(s, ...u) : o.ipcRenderer.send("REMOTE_BROWSER_WRONG_CONTEXT_ERROR", f, r, s);
      });
    }
    const ne = process.argv.includes("--enable-api-filtering-logging");
    function T() {
      const e = { stack: void 0 };
      return ne && Error.captureStackTrace(e, T), e.stack;
    }
    G("REMOTE_RENDERER_CALLBACK", (e, n) => {
      O.apply(e, _(n));
    }), G("REMOTE_RENDERER_RELEASE_CALLBACK", (e) => {
      O.remove(e);
    }), c.require = (e) => {
      const i = o.ipcRenderer.sendSync("REMOTE_BROWSER_REQUIRE", f, e, T());
      return _(i);
    };
    function te(e) {
      const i = o.ipcRenderer.sendSync("REMOTE_BROWSER_GET_BUILTIN", f, e, T());
      return _(i);
    }
    c.getBuiltin = te;
    function re() {
      const n = o.ipcRenderer.sendSync("REMOTE_BROWSER_GET_CURRENT_WINDOW", f, T());
      return _(n);
    }
    c.getCurrentWindow = re;
    function oe() {
      const n = o.ipcRenderer.sendSync("REMOTE_BROWSER_GET_CURRENT_WEB_CONTENTS", f, T());
      return _(n);
    }
    c.getCurrentWebContents = oe;
    function ie(e) {
      const i = o.ipcRenderer.sendSync("REMOTE_BROWSER_GET_GLOBAL", f, e, T());
      return _(i);
    }
    c.getGlobal = ie, Object.defineProperty(c, "process", {
      enumerable: !0,
      get: () => c.getGlobal("process")
    });
    function ce(e) {
      const n = () => e;
      return h.add(n), n;
    }
    c.createFunctionWithReturnValue = ce;
    const se = (e) => {
      Object.defineProperty(c, e, {
        enumerable: !0,
        get: () => c.getBuiltin(e)
      });
    };
    l.browserModuleNames.forEach(se);
  })(L)), L;
}
var Z;
function pe() {
  return Z || (Z = 1, (function(c) {
    var y = B && B.__createBinding || (Object.create ? (function(o, l, p, g) {
      g === void 0 && (g = p), Object.defineProperty(o, g, { enumerable: !0, get: function() {
        return l[p];
      } });
    }) : (function(o, l, p, g) {
      g === void 0 && (g = p), o[g] = l[p];
    })), a = B && B.__exportStar || function(o, l) {
      for (var p in o) p !== "default" && !Object.prototype.hasOwnProperty.call(l, p) && y(l, o, p);
    };
    if (Object.defineProperty(c, "__esModule", { value: !0 }), process.type === "browser")
      throw new Error('"@electron/remote" cannot be required in the browser process. Instead require("@electron/remote/main").');
    a(fe(), c);
  })(B)), B;
}
var q, Q;
function Re() {
  return Q || (Q = 1, q = pe()), q;
}
var x = Re();
const I = x.getCurrentWindow();
I.setAutoHideMenuBar(!1);
I.setMenuBarVisibility(!0);
I.on("leave-full-screen", () => {
  I.isDestroyed() ? x.app.exit(0) : I.webContents.closeDevTools();
});
