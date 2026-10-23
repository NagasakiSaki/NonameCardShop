import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await fs.promises.readFile(path.join(ROOT, "data/engine-manifest.json"), "utf8"));
for (const entry of manifest.manifest) {
  const file = path.join(ROOT, "vendor/noname", entry.file);
  const stat = await fs.promises.stat(file);
  if (stat.size !== entry.bytes) throw new Error(`文件大小不一致：${entry.file}`);
  const hash = createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  if (hash.digest("hex") !== entry.sha256) throw new Error(`文件校验失败：${entry.file}`);
}
console.log(`原版引擎校验通过：${manifest.files} 文件，${manifest.bytes} 字节。`);
