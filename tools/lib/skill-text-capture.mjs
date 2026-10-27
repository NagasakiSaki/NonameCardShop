// Extraction-only hooks. Never import this adapter into the real game engine.
export function captureSkillText({get,lib}){
  const tokens=[],definitions=new Map();
  const token=(kind,value)=>{const index=tokens.length;tokens.push({kind,value});return `⟦NONAME_TEXT_${index}⟧`;};
  get.poptip=value=>{
    if(value&&typeof value==='object'){
      const id=value.id||`anonymous:${definitions.size}`;
      definitions.set(id,value);return token('term',id);
    }
    return token('term',String(value));
  };
  lib.poptip.getInfo=id=>token('info',String(id));
  lib.poptip.getElement=get.poptip;
  get.translation=id=>token('translation',String(id));
  return {tokens,definitions};
}

const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',ensp:' ',emsp:' ',times:'×',divide:'÷',le:'≤',ge:'≥',ne:'≠',rarr:'→',larr:'←',hearts:'♥',diams:'♦',clubs:'♣',spades:'♠'};
export function skillPlainText(value){
  return String(value??'').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'')
    .replace(/<br\s*\/?\s*>/gi,'\n').replace(/<li\b[^>]*>/gi,'\n• ').replace(/<\/(p|div|li|ol|ul)>/gi,'\n')
    .replace(/<span\b([^>]*)>([\s\S]*?)<\/span>/gi,(_all,attrs,text)=>/\byellowtext\b/.test(attrs)?`〔黄色数值：${text}〕`:/\bfiretext\b/.test(attrs)?`〔红色数值：${text}〕`:text)
    .replace(/<\/?[a-z][\w:-]*(?:\s[^<>]*?)?\s*\/?>/gi,'')
    .replace(/&(?:nbsp|ensp|emsp);?/gi,' ')
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi,(all,key)=>{if(key[0]==='#'){const n=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):Number(key.slice(1));return n>0&&n<=0x10ffff?String.fromCodePoint(n):all;}return entities[key]??all;})
    .replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}
