import fs from 'node:fs';
import path from 'node:path';
import {root,run} from './process.mjs';
const executable=path.join(root,'desktop/node_modules/electron/dist/electron.exe');
if(!fs.existsSync(executable))throw new Error('缺少 Electron 开发运行时，请先执行 npm run setup。');
const env={...process.env,CARD_SHOP_DEVELOPMENT:'1'};delete env.ELECTRON_RUN_AS_NODE;
await run(executable,[path.join(root,'desktop')],{env});
