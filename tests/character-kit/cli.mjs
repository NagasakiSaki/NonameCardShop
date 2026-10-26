import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {ROOT} from '../../tools/character-kit/core.mjs';
import {PRESETS} from '../../experiments/character-art/appearance-data.mjs';
const cli=path.join(ROOT,'tools/character-kit/cli.mjs'),local=path.join(ROOT,'.local/character-kit');fs.mkdirSync(local,{recursive:true});
const temp=fs.mkdtempSync(path.join(local,'test-'));
const manifest=path.join(ROOT,'assets/frontend/manifest.json'),hash=()=>createHash('sha256').update(fs.readFileSync(manifest)).digest('hex'),before=hash();
let assertions=0;
function run(args,code=0){const p=spawnSync(process.execPath,[cli,...args,'--json'],{cwd:ROOT,encoding:'utf8',windowsHide:true});assert.equal(p.status,code,p.stdout+p.stderr);const result=JSON.parse(p.stdout.trim());assertions++;return result;}
function input(name,value){const file=path.join(temp,name+'.json');fs.writeFileSync(file,JSON.stringify(value));return file;}
try{
  assert.ok(run(['--help']).help.includes('validate'));assert.equal(run(['--version']).version,'1.0.0');
  const parts=run(['list-parts']);assert.equal(parts.templates.length,25);assert.ok(parts.parts.length>30);assert.ok(parts.parts.every(p=>p.width>0&&p.height>0&&p.license));
  for(const [name,value]of Object.entries({single:PRESETS[0],array:PRESETS,wrapped:{presets:PRESETS},web:{version:3,portrait:PRESETS[3]}}))assert.ok(run(['validate','--config',input(name,value)]).valid);
  const bad={...PRESETS[0],hair:['#nothex','#123456','#abcdef'],base:'missing-head'};
  const badResult=run(['validate','--config',input('bad',bad)],1);assert.ok(badResult.errors.some(e=>e.path==='/hair'&&e.code==='PALETTE'));assert.ok(badResult.errors.some(e=>e.path==='/base'&&e.code==='MISSING_PART'));
  assert.ok(run(['validate','--config',input('duplicate',[PRESETS[0],PRESETS[0]])],1).errors.some(e=>e.code==='DUPLICATE_ID'));
  assert.equal(run(['validate','--config',input('png',{portrait:'portrait.png'})],1).valid,false);
  assert.equal(run(['validate','--config',input('traversal',{...PRESETS[0],front:'../../head'})],1).errors[0].code,'PART_NAME');
  assert.equal(run(['validate','--config',input('bad-style',{...PRESETS[3],walkStyle:5})],1).errors[0].code,'FIELD_TYPE');
  assert.equal(run(['validate','--out',temp],2).error.code,'ARGUMENT');
  assert.equal(run(['contact-sheet','--out',path.resolve(ROOT,'..','escaped-art-output')],2).error.code,'OUTPUT_PATH');
  assert.equal(run(['contact-sheet','--out','assets/frontend/forbidden-art-output'],2).error.code,'OUTPUT_PATH');
  assert.equal(run(['contact-sheet','--out',temp],2).error.code,'OUTPUT_EXISTS');
  assert.equal(run(['contact-sheet','--out',temp,'--overwrite'],2).error.code,'OUTPUT_UNOWNED');
  const alias=path.join(temp,'assets-alias');fs.symlinkSync(path.join(ROOT,'assets'),alias,'junction');
  assert.equal(run(['contact-sheet','--out',path.join(alias,'forbidden-art-output')],2).error.code,'OUTPUT_PATH');
  const out=path.join(temp,'sheet'),sheet=run(['contact-sheet','--out',out]);assert.equal(sheet.characters,25);assert.equal(sheet.groups,5);assert.equal(sheet.files.length,7);assert.ok(sheet.files.every(f=>fs.existsSync(f)));
  const png=fs.readFileSync(path.join(out,'mygo-standing.png'));assert.equal(png.readUInt32BE(16),680);assert.equal(png.readUInt32BE(20),240);
  fs.writeFileSync(path.join(out,'keep.txt'),'existing unrelated file');run(['contact-sheet','--out',out,'--overwrite']);assert.equal(fs.readFileSync(path.join(out,'keep.txt'),'utf8'),'existing unrelated file');assert.equal(hash(),before);
  console.log(`PASS character-kit: ${assertions} CLI cases; 25 templates; structured errors; complete grouped sheets; output boundary/overwrite protection; production manifest unchanged.`);
}finally{
  if(!temp.startsWith(local+path.sep))throw new Error('Unexpected cleanup path');fs.rmSync(temp,{recursive:true,force:true});
}
