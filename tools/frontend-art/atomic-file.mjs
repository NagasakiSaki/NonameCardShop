import fs from 'node:fs';
import path from 'node:path';
// Publish complete manifests/maps; transient Windows readers must not leave partial JSON.
export function writeFileAtomic(file,data){
  const target=path.resolve(file),temp=target+`.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`;
  try{
    fs.writeFileSync(temp,data);
    for(let attempt=0;;attempt++){
      try{fs.renameSync(temp,target);return;}
      catch(error){if(attempt>=9||!['EPERM','EACCES','EBUSY','UNKNOWN'].includes(error.code))throw error;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,50*(attempt+1));}
    }
  }finally{if(fs.existsSync(temp))fs.rmSync(temp,{force:true});}
}
