import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {root} from './process.mjs';
const require=createRequire(import.meta.url);let failures=0;
function check(label,ok,fix=''){console.log(`${ok?'通过':'缺少'}：${label}${!ok&&fix?'；'+fix:''}`);if(!ok)failures++;}
const [major,minor]=process.versions.node.split('.').map(Number);
check(`Node.js ${process.versions.node}`,major>22||major===22&&minor>=12,'安装 Node.js >=22.12');
check('Git',spawnSync('git',['--version'],{windowsHide:true}).status===0,'安装 Git');
check('Git LFS',spawnSync('git',['lfs','version'],{windowsHide:true}).status===0,'安装 Git LFS 并执行 git lfs install');
for(const name of ['noname','dedent']){try{require.resolve(name);check(`源码适配器 ${name}`,true);}catch{check(`源码适配器 ${name}`,false,'npm ci');}}
try{const {chromium}=require('playwright');check('自动测试浏览器',fs.existsSync(chromium.executablePath()),'npm run setup');}catch{check('Playwright',false,'npm ci && npm run setup');}
check('Electron 开发运行时',fs.existsSync(path.join(root,'desktop/node_modules/electron/dist/electron.exe')),'npm run setup');
for(const file of ['vendor/noname/noname/entry.js','vendor/noname/image/character/caocao.jpg','data/cards.json','assets/shop/card-shop.png','assets/shop/owner.png']){
  if(!fs.existsSync(path.join(root,file))){check(file,false,'恢复项目文件或执行 git lfs pull');continue;}
  const fd=fs.openSync(path.join(root,file),'r'),buf=Buffer.alloc(100);fs.readSync(fd,buf,0,100,0);fs.closeSync(fd);check(file,!buf.toString().startsWith('version https://git-lfs.github.com/spec'),'git lfs pull');
}
console.log(failures?`${failures} 项需要修复。`:'开发环境就绪。完整引擎校验：npm run verify:engine');process.exitCode=failures?1:0;
