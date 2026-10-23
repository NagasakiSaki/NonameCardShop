// Import and verify the complete installed runtime without modifying vendor files.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = process.env.NONAME_APP || "D:/无名杀_三国杀/noname_new/resources/app";
const TARGET = path.join(ROOT, "vendor/noname");
const verifyOnly = process.argv.includes("--verify");
const manifest = [];
const hash = async (file) => {
  const digest = createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) digest.update(chunk);
  return digest.digest("hex");
};
async function walk(folder) {
  for (const entry of await fs.promises.readdir(path.join(SOURCE, folder), { withFileTypes: true })) {
    const relative = path.join(folder, entry.name);
    if (entry.isDirectory()) await walk(relative);
    else if (entry.isFile()) {
      const dest = path.join(TARGET, relative);
      if (!verifyOnly) {
        await fs.promises.mkdir(path.dirname(dest), { recursive: true });
        await fs.promises.copyFile(path.join(SOURCE, relative), dest);
      }
      const [original, copied] = await Promise.all([hash(path.join(SOURCE, relative)), hash(dest)]);
      if (original !== copied) throw new Error(`源码完整性检查失败：${relative}`);
      manifest.push({ file: relative.replaceAll("\\", "/"), bytes: (await fs.promises.stat(dest)).size, sha256: copied });
    }
  }
}
await walk("");
const result = { version: "1.11.6", importedAt: new Date().toISOString(), files: manifest.length, bytes: manifest.reduce((sum, file) => sum + file.bytes, 0), modifiedVendorFiles: 0, manifest };
await fs.promises.writeFile(path.join(ROOT, "data/engine-manifest.json"), JSON.stringify(result));
console.log(JSON.stringify({ ...result, manifest: undefined }));
