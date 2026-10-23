// 最小 stub：让无名杀的武将包模块能在 Node 里被 import，
// 只捕获 game.import("character", fn) 的返回值。
const makeStub = () =>
  new Proxy(function () {}, {
    get(t, p) {
      if (p === Symbol.toPrimitive) return () => "";
      if (p === "toString") return () => "";
      if (p === "valueOf") return () => 0;
      if (p === "then") return undefined;
      if (p === "length") return 0;
      if (!(p in t)) t[p] = makeStub();
      return t[p];
    },
    set(t, p, v) {
      t[p] = v;
      return true;
    },
    has() {
      return true;
    },
    apply() {
      return makeStub();
    },
    construct() {
      return makeStub();
    },
  });

export const captured = [];

export const lib = makeStub();
export const ui = makeStub();
export const get = makeStub();
export const ai = makeStub();
export const _status = makeStub();
export const game = makeStub();

game.import = (type, fn) => {
  try {
    captured.push({ type, data: fn() });
  } catch (e) {
    captured.push({ type, error: String(e) });
  }
};

export default { lib, ui, get, ai, _status, game };
