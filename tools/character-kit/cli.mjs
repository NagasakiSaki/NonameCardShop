#!/usr/bin/env node
import {VERSION,KitError,listParts,readConfig,validateConfig,contactSheet} from './core.mjs';
const help=`人物工具 character-kit ${VERSION}
node tools/character-kit/cli.mjs list-parts [--json]
node tools/character-kit/cli.mjs validate --config <file> [--json]
node tools/character-kit/cli.mjs contact-sheet --out <project-directory> [--overwrite] [--json]
--help / --version
不依赖 API、GUI 或额外 npm 包；不修改正式资源、Host 和存档。
渲染/安装仍用已有 art:build / art:install；本工具不会隐式安装。`;
const args=process.argv.slice(2),json=args.includes('--json');
const print=value=>console.log(JSON.stringify(value));
try{
  const command=args[0],options={},flags=new Set(['--json','--overwrite','--help','--version']);
  for(let i=1;i<args.length;i++){
    const key=args[i];
    if(flags.has(key)){if(options[key])throw new KitError('ARGUMENT','重复参数：'+key);options[key]=true;}
    else if(['--config','--out'].includes(key)){if(options[key]||!args[i+1]||args[i+1].startsWith('--'))throw new KitError('ARGUMENT','参数值缺失或重复：'+key);options[key]=args[++i];}
    else throw new KitError('ARGUMENT','未知参数：'+key);
  }
  if(!command||args.includes('--help')){json?print({ok:true,version:VERSION,help}):console.log(help);}
  else if(args.includes('--version')){json?print({ok:true,version:VERSION}):console.log(VERSION);}
  else{
    const allowed={ 'list-parts':['--json'],validate:['--config','--json'],'contact-sheet':['--out','--overwrite','--json']}[command];
    if(!allowed)throw new KitError('ARGUMENT','未知命令：'+command);
    for(const key of Object.keys(options))if(!allowed.includes(key))throw new KitError('ARGUMENT','此命令不接受 '+key);
    let data;
    if(command==='list-parts')data=listParts();
    if(command==='validate'){data=validateConfig(readConfig(options['--config']));if(!data.valid)process.exitCode=1;}
    if(command==='contact-sheet')data=contactSheet(options['--out'],{overwrite:!!options['--overwrite']});
    const ok=command==='validate'?data.valid:true;
    if(json)print({ok,command,...data});
    else if(command==='list-parts')console.log(`${data.parts.length} 个 PNG 部件，${data.templates.length} 个模板。使用 --json 获取完整配置、路径、尺寸和署名。`);
    else if(command==='validate'){console.log(`${ok?'通过':'失败'}：${data.count} 个配置，${data.errors.length} 个错误，${data.warnings.length} 个提示。`);for(const e of [...data.errors,...data.warnings])console.error(`${e.path} [${e.code}] ${e.message}`);}
    else console.log(`已导出 ${data.groups} 组、${data.characters} 人：${data.out}`);
  }
}catch(error){
  process.exitCode=2;
  const code=error.code||'INTERNAL',message=error.message;
  if(json)print({ok:false,error:{code,message,details:error.details||[]}});else console.error(`[${code}] ${message}`);
}
