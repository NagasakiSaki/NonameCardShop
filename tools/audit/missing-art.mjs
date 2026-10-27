// tools/audit/missing-art.mjs — 缺图登记与来源核对（只读）。
//
// 目的：把“哪些武将卡图缺失”从一次人工盘点变成可重复核对，并为每一条记录：
//   1. 卡牌身份（cardKey / generalId / 主题 / 是否在售）；
//   2. 期望文件与解析后的真实路径；
//   3. 仓库内是否存在可合法替代的候选（同名不同扩展、同武将其他文件名、旧图目录）；
//   4. 处理结论（补源 / 保持占位 / 需人工确认）。
//
// 边界：不写文件、不改 catalog、不改 vendor、不下载外部素材。来源未确认的一律保持占位。
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
export const projectRoot=path.resolve(here,'..','..');
const characterDir=path.join(projectRoot,'vendor/noname/image/character');
const legacyDir=path.join(projectRoot,'assets/character');

const IMAGE_EXTENSIONS=['.jpg','.jpeg','.png','.webp','.bmp'];

function listFiles(directory){
  if(!fs.existsSync(directory))return [];
  return fs.readdirSync(directory,{withFileTypes:true}).filter(entry=>entry.isFile()).map(entry=>entry.name);
}

/**
 * @param {object} options
 * @param {object[]} options.cards catalog 源卡牌（data/cards.json 的 cards 数组）
 * @param {string[]} [options.activeThemes] 当前在售主题；不传则按 rules 判定
 */
export function auditMissingArt({cards,activeThemes=null}={}){
  const characterFiles=new Set(listFiles(characterDir));
  const legacyFiles=new Set(listFiles(legacyDir));
  const lowerIndex=new Map();
  for(const name of characterFiles)lowerIndex.set(name.toLowerCase(),name);
  const legacyLower=new Map();
  for(const name of legacyFiles)legacyLower.set(name.toLowerCase(),name);

  const rows=[];
  for(const card of cards){
    const expected=card.img;
    if(!expected)continue;
    if(characterFiles.has(expected))continue;
    const base=expected.replace(/\.[^.]+$/,'');
    const sameGeneral=[];

    // 同名不同扩展
    for(const extension of IMAGE_EXTENSIONS){
      const candidate=base+extension;
      if(characterFiles.has(candidate))sameGeneral.push({kind:'same-basename',file:candidate,dir:'vendor/noname/image/character'});
      const legacyCandidate=legacyLower.get(candidate.toLowerCase());
      if(legacyCandidate)sameGeneral.push({kind:'same-basename',file:legacyCandidate,dir:'assets/character'});
    }
    // 同武将 ID 的其他文件名（如 xxx_1.jpg、xxx_old.jpg）
    const generalId=card.id||'';
    if(generalId){
      for(const name of characterFiles){
        if(name.toLowerCase().startsWith(generalId.toLowerCase()+'_')||name.toLowerCase().startsWith(generalId.toLowerCase()+'.')){
          if(name!==expected)sameGeneral.push({kind:'same-general-prefix',file:name,dir:'vendor/noname/image/character'});
        }
      }
    }
    const decision=sameGeneral.length?'review-alternative-candidate':'keep-placeholder-no-source';
    rows.push({
      cardKey:card.cardKey,generalId:card.id,name:card.name,themeId:card.pack,
      expectedFile:expected,expectedPath:`vendor/noname/image/character/${expected}`,
      resolvedUrl:`/img/${encodeURIComponent(expected)}`,
      candidates:sameGeneral,
      decision,
      reason:sameGeneral.length
        ?'仓库内存在同名或同武将前缀的其他文件，但文件名不同可能代表不同版本/皮肤，需人工确认后才可替换。'
        :'仓库内没有同名其他扩展、没有同武将前缀文件、旧图目录也没有；保持缺图占位。',
    });
  }

  const byTheme={};
  for(const row of rows)byTheme[row.themeId]=(byTheme[row.themeId]||0)+1;
  const activeCount=activeThemes?rows.filter(row=>activeThemes.includes(row.themeId)).length:null;
  return {
    version:1,generatedAt:new Date().toISOString(),
    totals:{
      catalogCards:cards.length,
      characterFiles:characterFiles.size,
      missing:rows.length,
      missingInActiveThemes:activeCount,
      withAlternativeCandidate:rows.filter(row=>row.candidates.length).length,
      keptPlaceholder:rows.filter(row=>row.decision==='keep-placeholder-no-source').length,
    },
    byTheme,
    rows,
  };
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const source=JSON.parse(fs.readFileSync(path.join(projectRoot,'data/cards.json'),'utf8'));
  // 在售主题以固定发行登记为准（data/print-editions.json 的 products），不是历史任务书里的列表。
  const editions=JSON.parse(fs.readFileSync(path.join(projectRoot,'data/print-editions.json'),'utf8'));
  const activeThemes=Object.keys(editions.products||{});
  const report=auditMissingArt({cards:source.cards,activeThemes});
  const jsonIndex=process.argv.indexOf('--json');
  if(jsonIndex>0&&process.argv[jsonIndex+1]){
    const target=path.resolve(process.argv[jsonIndex+1]);
    fs.mkdirSync(path.dirname(target),{recursive:true});
    fs.writeFileSync(target,JSON.stringify(report,null,2));
    console.log(`已写入 ${path.relative(process.cwd(),target)}`);
  }
  console.log(`卡牌 ${report.totals.catalogCards}，角色图 ${report.totals.characterFiles}，缺图 ${report.totals.missing}（在售主题 ${report.totals.missingInActiveThemes}）`);
  console.log(`有候选 ${report.totals.withAlternativeCandidate}，保持占位 ${report.totals.keptPlaceholder}`);
  for(const row of report.rows)console.log(`  ${row.generalId.padEnd(22)} ${row.themeId.padEnd(10)} ${row.expectedFile.padEnd(24)} ${row.decision}`);
}
