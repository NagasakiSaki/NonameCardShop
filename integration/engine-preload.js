// The vendor engine is unchanged. This file is served at its supported /preload.js hook.
import browserReady from "/noname/init/browser.js";
import { installCollectionDuel } from "/shop-integration/duel.js";

const params = new URLSearchParams(location.search);
const embedded = params.get("packer") === "1";
const matchId = params.get("match");
const parentOrigin = params.get("parentOrigin");
const general = params.get("general");
const opponent = params.get("opponent");
const collectionBattle = embedded && general && opponent;
const notify = (type, data = {}) => {
  if (embedded && /^http:\/\/127\.0\.0\.1:\d+$/.test(parentOrigin || "")) {
    parent.postMessage({ channel: "noname-packer", matchId, type, ...data }, parentOrigin);
  }
};

async function seedConfig(prefix, values) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(prefix + "data", 4);
    request.onupgradeneeded = () => {
      for (const name of ["config", "data", "image", "audio", "video"]) {
        if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, name === "video" ? { keyPath: "time" } : undefined);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise((resolve, reject) => {
    const tx = db.transaction("config", "readwrite");
    for (const [key, value] of Object.entries(values)) tx.objectStore("config").put(value, key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export default async function preload(context) {
  const { lib, game, ui, get, _status } = context;
  await browserReady(context);
  lib.configprefix = collectionBattle ? "packer_match_v1_" : "packer_classic_v1_";
  if (!embedded) return;
  notify("loading", { text: "正在载入原版规则、武将和卡牌…" });
  window.addEventListener("error", (event) => { if (event.error) notify("error", { text: event.message }); });
  window.addEventListener("unhandledrejection", (event) => notify("error", { text: String(event.reason?.message || event.reason) }));
  if (collectionBattle) {
    const config = {
      mode: "identity", show_splash: "off", new_tutorial: true, version: "1.11.6",
      extensions: [], hiddenCharacterPack: [], characters: Object.keys((await import("/game/package.js"), window.noname_package.character)),
      cards: ["standard", "extra"], background_music: "music_off", confirm_exit: false,
      identity_mode_mode_config_identity: "normal", player_number_mode_config_identity: "2",
      double_character_mode_config_identity: false, enhance_zhu_mode_config_identity: "off",
      enable_mingcha_mode_config_identity:false, dierestart_mode_config_identity:false, continue_game_mode_config_identity:false, revive_mode_config_identity:false,
      enable_year_limit_mode_config_identity: false, change_choice: false, free_choose: false,
      test_game: false, connect_mode: false, card_style: "default",
      change_card_mode_config_identity: "disabled",
    };
    await seedConfig(lib.configprefix, config);
    game.reload = () => notify("restart-request");
    localStorage.setItem(lib.configprefix + "directstart", "true");
    const readTeam=(key,fallback)=>{const raw=params.get(key);if(!raw)return [fallback];const result=JSON.parse(raw);if(!Array.isArray(result)||!result.every(id=>typeof id==="string"&&id.length<100))throw new Error("阵容参数不合法");return result;};
    const roster=readTeam("roster",general),opponentRoster=readTeam("opponentRoster",opponent),mode=params.get("duelMode")==="kof"?"kof":"bo3";
    if(roster.length!==(mode==="kof"?3:1)||opponentRoster.length!==roster.length)throw new Error("阵容人数不符合赛制");
    const first=params.get("first")==="1"?1:0,initialHand=Math.min(8,Math.max(1,Number(params.get("initialHand"))||4)),firstDrawPenalty=Math.min(2,Math.max(0,Number(params.get("firstDrawPenalty"))||0));
    installCollectionDuel(context,{roster,opponentRoster,mode,first,initialHand,firstDrawPenalty},notify);
  } else {
    await seedConfig(lib.configprefix, { new_tutorial: true, version: "1.11.6", show_splash: "always", confirm_exit: false, background_music: "music_off", card_style: "default" });
  }
  lib.onover.push((won) => {
    notify("result", {
      result: won === true ? "win" : won === false ? "loss" : "draw",
      general: game.me?.name || general, opponent,
      round: game.roundNumber || 0,
    });
  });
  if (!collectionBattle) lib.onload.push(() => notify("ready", { classic: true }));
}
