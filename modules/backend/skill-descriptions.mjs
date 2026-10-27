import {SKILL_TEXTS,SKILL_TEXT_VERSION} from '../../data/skill-texts.mjs';
import {clone} from './common.mjs';

// Display repair is separate from the historical text used by the rating model.
// A custom/updated description must never be replaced by an older compiled one.
export function describeSkill(pack,skill){
  const entry=SKILL_TEXTS[pack+':'+skill.id];
  if(!entry||String(skill.description||'')!==entry.originalDescription)return clone(skill);
  return {...clone(skill),description:entry.description,descriptionVersion:SKILL_TEXT_VERSION,
    dynamicDescription:entry.dynamicTranslation,descriptionVariants:clone(entry.variants)};
}
