// Export a safe publication repository without changing the original checkout/history.
import fs from 'node:fs';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {root} from './process.mjs';
const destination=path.join(root,'.local/github-publish.git'),repository='NagasakiSaki/NonameCardShop';
const prepareOnly=process.argv.includes('--prepare');
const git=(args,cwd=root)=>execFileSync('git',args,{cwd,encoding:'utf8',windowsHide:true,maxBuffer:20*1024*1024}).trim();
if(!prepareOnly){const info=JSON.parse(execFileSync('gh',['repo','view',repository,'--json','isPrivate,url'],{encoding:'utf8',windowsHide:true}));if(info.isPrivate!==true)throw new Error('只允许向已确认的私有仓库发布。');}
fs.mkdirSync(path.dirname(destination),{recursive:true});
if(!fs.existsSync(destination))git(['init','--bare','--initial-branch=main',destination]);
if(git(['rev-parse','--is-bare-repository'],destination)!=='true')throw new Error('发布副本必须是独立裸仓库。');
await new Promise((resolve,reject)=>{
  const exporter=spawn('git',['fast-export','--all','--signed-tags=strip','--tag-of-filtered-object=rewrite','--','.',' :(exclude)vendor/noname/Home'.trim()],{cwd:root,stdio:['ignore','pipe','pipe'],windowsHide:true});
  const importer=spawn('git',['fast-import','--quiet'],{cwd:destination,stdio:['pipe','ignore','pipe'],windowsHide:true});
  const errors=[];exporter.stderr.on('data',d=>errors.push(d.toString()));importer.stderr.on('data',d=>errors.push(d.toString()));exporter.stdout.pipe(importer.stdin);
  importer.stdin.on('error',()=>{});let exits=0,failed=false;
  const finish=(code)=>{failed ||= code!==0;if(++exits===2)failed?reject(new Error(errors.join('\n')||'安全历史导出失败。')):resolve();};
  exporter.once('error',reject);importer.once('error',reject);exporter.once('exit',finish);importer.once('exit',finish);
});
const files=git(['rev-list','--objects','--all'],destination);
if(/ vendor\/noname\/Home(?:\/|$)/im.test(files))throw new Error('发布副本仍包含上游用户缓存，已停止上传。');
git(['config','lfs.storage',path.join(root,'.git/lfs')],destination);
git(['config','lfs.concurrenttransfers','32'],destination);
git(['config','credential.https://github.com.helper',''],destination);
git(['config','--add','credential.https://github.com.helper','!gh auth git-credential'],destination);
const url=`https://github.com/${repository}.git`;
if(git(['remote'],destination).split('\n').includes('origin'))git(['remote','set-url','origin',url],destination);else git(['remote','add','origin',url],destination);
git(['lfs','install','--local'],destination);
console.log(`安全发布副本已准备：${destination}\nGitHub：${repository}（仅私有）\n上游 Home 浏览器用户缓存已从导出历史排除。`);
if(!prepareOnly){
  const progress=path.join(root,'.local/lfs-upload-progress.log');
  await new Promise((resolve,reject)=>{const child=spawn('git',['push','--set-upstream','origin','main','--tags'],{cwd:destination,env:{...process.env,GIT_LFS_PROGRESS:progress},stdio:'inherit',windowsHide:true});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error(`私有仓库推送失败（${code}），原本地仓库保持不变。`)));});
  console.log('私有仓库推送完成。');
}
