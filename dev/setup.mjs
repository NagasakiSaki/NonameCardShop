import fs from 'node:fs';
import path from 'node:path';
import {root,run,npm} from './process.mjs';
if(Number(process.versions.node.split('.')[0])<22)throw new Error('请安装 Node.js 22.12 或更新版本。');
if(!fs.existsSync(path.join(root,'node_modules/playwright/package.json')))await npm(['ci']);
if(!fs.existsSync(path.join(root,'desktop/node_modules/electron/package.json')))await npm(['ci'],{cwd:path.join(root,'desktop')});
if(!fs.existsSync(path.join(root,'desktop/node_modules/electron/dist/electron.exe')))await run(process.execPath,['desktop/node_modules/electron/install.js']);
await run(process.execPath,['node_modules/playwright/cli.js','install','chromium']);
await run(process.execPath,['dev/doctor.mjs']);
