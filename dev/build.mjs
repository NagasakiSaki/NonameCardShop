import {npm} from './process.mjs';
const mode=process.argv[2];if(!['dir','exe'].includes(mode))throw new Error('使用 build:dir 或 build:exe');
await npm(['--prefix','desktop','run',mode==='exe'?'dist':'pack'],{env:{...process.env,ELECTRON_BUILDER_7Z_FILTER:'BCJ'}});
