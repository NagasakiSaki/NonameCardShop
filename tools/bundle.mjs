// Package the original skill text, exact source code, and portraits for offline use.
// Acorn (MIT) is vendored so extraction does not require npm install.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse } from "./vendor/acorn.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP = process.env.NONAME_APP || "D:/无名杀_三国杀/noname_new/resources/app";
const read = (file) => fs.readFileSync(file, "utf8");
const writeJSON = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value), "utf8");
};
const cardsFile = path.join(ROOT, "data/cards.json");
const data = JSON.parse(read(cardsFile));
globalThis.window = globalThis;
globalThis.document = {
  createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }),
  addEventListener() {}, querySelector: () => null,
};
globalThis.localStorage = { getItem: () => null, setItem() {} };
const { captured } = await import("noname");
const modules = [];
for (const pack of data.packs) {
  const file = `tools/_chars/${pack.id}.js`;
  const before = captured.length;
  await import(pathToFileURL(path.join(ROOT, file)).href);
  const pkg = captured.splice(before).find((item) => item.type === "character" && item.data);
  if (!pkg) throw new Error(`无法导入武将包 ${pack.id}`);
  modules.push({ id: pack.id, file, data: pkg.data });
}

// Preserve core skills too; references such as inherit/group may cross packages.
const coreFile = "tools/_core/skill.js";
fs.mkdirSync(path.join(ROOT, "tools/_core"), { recursive: true });
const installedCore = path.join(APP, "noname/library/skill.js");
if (fs.existsSync(installedCore)) fs.copyFileSync(installedCore, path.join(ROOT, coreFile));
if (fs.existsSync(path.join(ROOT, coreFile))) modules.push({ id: "core", file: coreFile, data: {} });
const installedLicense = path.join(APP, "LICENSE");
if (fs.existsSync(installedLicense)) fs.copyFileSync(installedLicense, path.join(ROOT, "NONAME-LICENSE"));

const registry = new Map();
const candidates = new Map();
const translations = Object.assign({}, ...modules.map((mod) => mod.data.translate || {}));
const propertyName = (node) => node.computed ? (node.key.type === "Literal" ? String(node.key.value) : null) : node.key.name ?? String(node.key.value);
function collectStrings(node, result = []) {
  if (!node) return result;
  if (node.type === "Literal" && typeof node.value === "string") result.push(node.value);
  if (node.type === "ArrayExpression") node.elements.forEach((item) => collectStrings(item, result));
  return result;
}
function collectObject(mod, source, object, prefix = "") {
  for (const prop of object.properties) {
    if (prop.type !== "Property") continue;
    const name = propertyName(prop);
    if (name == null) continue;
    const id = prefix + name;
    const node = prop.value;
    const local = mod.data.translate || {};
    const refs = [];
    if (node.type === "ObjectExpression") {
      for (const child of node.properties) {
        if (child.type !== "Property") continue;
        const key = propertyName(child);
        if (["inherit", "group", "global", "derivation"].includes(key)) collectStrings(child.value, refs);
        if (key === "subSkill" && child.value.type === "ObjectExpression") collectObject(mod, source, child.value, `${id}_`);
      }
    }
    const record = {
      key: `${mod.id}:${id}`, id,
      name: local[id] || translations[id] || id,
      description: local[`${id}_info`] || translations[`${id}_info`] || "",
      code: source.slice(node.start, node.end),
      source: { file: mod.file, line: node.loc.start.line },
      refs,
    };
    registry.set(record.key, record);
    if (!candidates.has(id)) candidates.set(id, []);
    candidates.get(id).push(record);
  }
}
for (const mod of modules) {
  const source = read(path.join(ROOT, mod.file));
  const ast = parse(source, { ecmaVersion: "latest", sourceType: "module", locations: true });
  const declarations = ast.body.flatMap((node) => node.type === "VariableDeclaration" ? node.declarations : [])
    .filter((node) => /^skills(?:\$\w+)?$/.test(node.id.name) && node.init?.type === "ObjectExpression");
  if (!declarations.length) throw new Error(`未找到技能对象：${mod.file}`);
  for (const declaration of declarations) collectObject(mod, source, declaration.init);
}
function resolve(id, packId) {
  return registry.get(`${packId}:${id}`) || candidates.get(id)?.[0];
}
for (const record of registry.values()) {
  const packId = record.key.split(":")[0];
  record.dependencies = [...new Set(record.refs.filter((id) => id !== record.id))]
    .map((id) => ({ id, key: resolve(id, packId)?.key || null }));
  delete record.refs;
}

const missingSkills = [];
const missingDescriptions = [];
const missingImages = [];
const imageDir = path.join(ROOT, "assets/character");
fs.mkdirSync(imageDir, { recursive: true });
for (const pack of data.packs) {
  const local = modules.find((mod) => mod.id === pack.id).data.translate || {};
  const details = {};
  function include(record) {
    if (!record || details[record.key]) return;
    details[record.key] = record;
    record.dependencies.forEach((ref) => include(registry.get(ref.key)));
  }
  for (const card of data.cards.filter((item) => item.pack === pack.id)) {
    card.skills = card.skills.map((skill) => {
      const record = resolve(skill.id, pack.id);
      const description = local[`${skill.id}_info`] || translations[`${skill.id}_info`] || record?.description || "";
      if (!record) missingSkills.push({ card: card.id, skill: skill.id });
      if (!description) missingDescriptions.push({ card: card.id, skill: skill.id });
      include(record);
      return { id: skill.id, name: local[skill.id] || translations[skill.id] || skill.name, description, key: record?.key || null };
    });
    const dest = path.join(imageDir, path.basename(card.img));
    const source = path.join(APP, "image/character", path.basename(card.img));
    if (fs.existsSync(source)) fs.copyFileSync(source, dest);
    if (!fs.existsSync(dest)) missingImages.push({ card: card.id, image: card.img });
  }
  writeJSON(path.join(ROOT, `data/skills/${pack.id}.json`), { pack: pack.id, skills: details });
}
data.bundledAt = new Date().toISOString();
writeJSON(cardsFile, data);
const report = {
  generatedAt: data.bundledAt, cards: data.cards.length, skills: registry.size,
  portraits: new Set(data.cards.map((card) => card.img)).size - new Set(missingImages.map((item) => item.image)).size,
  missingSkills, missingDescriptions, missingImages,
};
writeJSON(path.join(ROOT, "data/bundle-report.json"), report);
console.log(JSON.stringify({ ...report, missingSkills: missingSkills.length, missingDescriptions: missingDescriptions.length, missingImages: missingImages.length }, null, 2));
