// One read-only upstream source for catalogue/code extraction. Never copy it into tools/.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const nonameRoot=path.resolve(process.env.NONAME_APP||path.join(projectRoot,'vendor/noname'));
export const characterRoot=path.join(nonameRoot,'character');
export const coreSkillFile=path.join(nonameRoot,'noname/library/skill.js');
export const sourceLabel=file=>path.relative(projectRoot,file).replaceAll('\\','/');
