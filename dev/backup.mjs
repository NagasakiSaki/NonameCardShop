// Local, restorable source + real asset snapshot. Never touches browser save databases.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {root} from './process.mjs';
const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:20*1024*1024}).trim();
export function backupPlan(){
  const files=[...new Set(git(['ls-files','-z','--cached','--others','--exclude-standard']).split('\0'))].filter(file=>file&&!/^vendor\/noname\/Home(?:\/|$)/i.test(file)&&fs.existsSync(path.join(root,file))&&fs.statSync(path.join(root,file)).isFile());
  return {head:git(['rev-parse','HEAD']),files,bytes:files.reduce((n,f)=>n+fs.statSync(path.join(root,f)).size,0)};
}
const hash=async file=>{const h=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(file))h.update(chunk);return h.digest('hex');};
export async function backupStable(destination){
  const plan=backupPlan(),target=path.resolve(destination);
  if(target===root||target.startsWith(root+path.sep))throw Error('备份目录必须在工程外，避免递归备份。');
  if(fs.existsSync(target))throw Error('备份目录已存在，不覆盖已有备份。');
  fs.mkdirSync(target,{recursive:true});const manifest={version:1,head:plan.head,createdAt:new Date().toISOString(),privateLocalHistory:true,files:[],excluded:['ignored dependencies/caches/builds/candidate deliveries','vendor/noname/Home'],savePolicy:'Browser/Electron saves remain in their original profiles; this source snapshot does not copy or clear them.'};
  for(const file of plan.files){
    const source=path.join(root,file),copy=path.join(target,'project',file),digest=await hash(source);
    fs.mkdirSync(path.dirname(copy),{recursive:true});await fs.promises.copyFile(source,copy);
    if(await hash(copy)!==digest)throw Error('备份期间文件变化或校验失败：'+file);
    manifest.files.push({file,bytes:fs.statSync(copy).size,sha256:digest});
  }
  git(['bundle','create',path.join(target,'history.bundle'),'--all']);git(['bundle','verify',path.join(target,'history.bundle')]);
  fs.writeFileSync(path.join(target,'snapshot-manifest.json'),JSON.stringify(manifest,null,2));
  fs.writeFileSync(path.join(target,'RESTORE.md'),'# 本地工程快照\n\n先把当前工程另存。在一个新目录 git clone 此备份的 history.bundle，再将 project/ 的真实文件复制覆盖到新克隆目录；npm ci 后 node dev/start-game.mjs。恢复未提交文件以快照为准。\n\n此目录只作本机恢复，完整历史可能含旧本机资料，不要直接上传备份。玩家存档留在原浏览器/Electron用户目录，请使用游戏导出功能另存；本命令不改变用户进度。依赖、缓存、安装包、外部候选交付不在源码快照中。snapshot-manifest.json 是逐文件SHA256清单。\n');
  return {destination:target,head:plan.head,files:manifest.files.length,bytes:plan.bytes};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.includes('--plan')){const {files,...plan}=backupPlan();console.log(JSON.stringify({...plan,files:files.length},null,2));}
  else{const option=process.argv.find(a=>a.startsWith('--output=')),name='NonameCardShop-'+git(['rev-parse','--short','HEAD'])+'-'+new Date().toISOString().replace(/[:.]/g,'-'),destination=option?option.slice(9):path.join(root,'../StableBackups',name);console.log(JSON.stringify(await backupStable(destination),null,2));}
}
