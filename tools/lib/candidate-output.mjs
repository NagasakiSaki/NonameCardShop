import fs from 'node:fs';
import path from 'node:path';

const inside=(parent,child)=>{const rel=path.relative(parent,child);return rel===''||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));};

// Candidate tools may create a NEW directory outside the project, or below .local.
// Resolve existing ancestors first, so a junction cannot bypass the same rule.
export function reserveCandidateDirectory({root,output,sources=[]}){
  root=fs.realpathSync(root);
  const target=path.resolve(root,output);
  let ancestor=target;
  while(!fs.existsSync(ancestor)){const next=path.dirname(ancestor);if(next===ancestor)throw Error('找不到输出目录的父目录');ancestor=next;}
  const resolved=path.resolve(fs.realpathSync(ancestor),path.relative(ancestor,target));
  if(fs.existsSync(resolved))throw Error('候选目录已存在，拒绝覆盖：'+resolved);
  if(inside(resolved,root)||(inside(root,resolved)&&!inside(path.join(root,'.local'),resolved)))throw Error('候选输出必须在 .local 的新子目录或工程外：'+resolved);
  for(const input of sources){const source=fs.realpathSync(input);if(inside(source,resolved)||inside(resolved,source))throw Error('源目录与输出目录不能重叠：'+source);}
  fs.mkdirSync(resolved,{recursive:true});
  return resolved;
}

export function argument(args,name,fallback){
  const prefix='--'+name+'=',inline=args.find(a=>a.startsWith(prefix));
  if(inline)return inline.slice(prefix.length);
  const index=args.indexOf('--'+name);
  if(index<0)return fallback;
  if(!args[index+1]||args[index+1].startsWith('--'))throw Error('缺少参数 --'+name);
  return args[index+1];
}
