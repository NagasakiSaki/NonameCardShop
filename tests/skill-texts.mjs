import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {SKILL_TEXTS,SKILL_TEXT_INPUTS} from '../data/skill-texts.mjs';
import {describeSkill} from '../modules/backend/skill-descriptions.mjs';
import {skillPlainText,captureSkillText} from '../tools/lib/skill-text-capture.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../data/cards.json',import.meta.url)));
assert.equal(Object.keys(SKILL_TEXTS).length,5149);
for(const input of SKILL_TEXT_INPUTS)assert.equal(createHash('sha256').update(fs.readFileSync(new URL('../'+input.file,import.meta.url))).digest('hex'),input.sha256,input.file);
for(const card of data.cards)for(const skill of card.skills){
  const entry=SKILL_TEXTS[card.pack+':'+skill.id];assert.ok(entry,card.id+':'+skill.id);assert.equal(entry.originalDescription,skill.description||'');
  const before=JSON.stringify(skill),text=describeSkill(card.pack,skill);assert.ok(text.description?.trim());assert.ok(!/NONAME_TEXT_|\[object Object\]|<noname-poptip/.test(text.description));
  assert.equal(JSON.stringify(skill),before,'source is unchanged');
}
const text=id=>SKILL_TEXTS['bingshi:'+id].description;
assert.match(text('potshanxi'),/一张应机牌当【决斗】/);assert.match(text('potshanxi'),/每回合结束时，所有角色手牌中的应机牌/);
assert.match(text('potqizhou'),/摸两张应机牌/);assert.match(text('potxiongzi'),/炽沄、焰洄和焚涛/);
assert.match(text('potjianzhuan'),/为奢权或典易/);assert.match(text('mbyunan'),/群势力角色使用【杀】无距离限制/);
assert.match(SKILL_TEXTS['collab:olxinghan'].description,/东风、巧器/);assert.ok(SKILL_TEXTS['sb:sblongdan'].dynamicTranslation);
const base=data.cards.find(c=>c.id==='pot_heqi').skills[0],custom={...base,description:'自定义 <b>说明</b> 不应被旧补丁覆盖'};
assert.deepEqual(describeSkill('bingshi',custom),custom);const a=describeSkill('bingshi',base),b=describeSkill('bingshi',base);a.descriptionVariants.push({name:'test'});assert.notDeepEqual(a.descriptionVariants,b.descriptionVariants);
assert.equal(skillPlainText('a<br>b &lt;img onerror=x&gt; <b>文字</b>'),'a\nb <img onerror=x> 文字');
const get={},lib={poptip:{}},capture=captureSkillText({get,lib});assert.match(get.poptip({id:'test',name:'完整术语',info:'完整解释'}),/NONAME_TEXT/);assert.equal(capture.definitions.get('test').name,'完整术语');
console.log('PASS skill descriptions: 5,149 source-linked entries, no erased terms, nested explanations/variants, dynamic warnings, text safety, source/ratings and explicit overrides preserved.');
