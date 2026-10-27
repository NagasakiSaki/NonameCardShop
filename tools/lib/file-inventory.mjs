import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

export const sha256=value=>createHash('sha256').update(value).digest('hex');
export function fileInventory(directory,{skip=()=>false,normalize=(_file,bytes)=>bytes}={}){
  const files=[];
  function walk(dir,prefix=''){
    for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en'))){
      const relative=prefix+entry.name;if(skip(relative,entry))continue;
      if(entry.isSymbolicLink())throw Error('候选源不允许符号链接或 junction：'+relative);
      const full=path.join(dir,entry.name);
      if(entry.isDirectory())walk(full,relative+'/');
      else if(entry.isFile()){const bytes=normalize(relative,fs.readFileSync(full));files.push({path:relative,bytes:Buffer.byteLength(bytes),sha256:sha256(bytes)});}
      else throw Error('不支持的文件类型：'+relative);
    }
  }
  walk(directory);return files;
}
export const inventoryHash=files=>sha256(JSON.stringify(files));
