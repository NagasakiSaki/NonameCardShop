import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {BAND_APPEARANCES} from '../data/band-appearances.mjs';
import {decodePng} from '../tools/frontend-art/png.mjs';
import {applyCharacterPack} from '../tools/frontend-art/character-pack.mjs';
const registry=JSON.parse(fs.readFileSync('data/character-portraits.json')),manifest=JSON.parse(fs.readFileSync('assets/frontend/manifest.json'));
assert.deepEqual(Object.keys(registry.characters).sort(),BAND_APPEARANCES.map(c=>c.id).sort());
for(const [id,c]of Object.entries(registry.characters)){
 const actor=manifest.characters[id];assert.equal(actor.portrait,c.portrait.url);assert.equal(actor.avatar,c.avatar.url);assert.equal(actor.portraitSource.sha256,c.sourceSha256);
 for(const [asset,size]of [[c.portrait,[128,224]],[c.avatar,[96,96]]]){
  const bytes=fs.readFileSync('.'+asset.url);assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);const im=decodePng(bytes);assert.deepEqual([im.width,im.height],size);
  const colors=new Set();for(let i=0;i<im.rgba.length;i+=4){assert.ok(im.rgba[i+3]===0||im.rgba[i+3]===255);if(im.rgba[i+3])colors.add(Buffer.from(im.rgba.subarray(i,i+3)).toString('hex'));}assert.ok(colors.size<=64);
 }
}
const rebuilt=applyCharacterPack(structuredClone(manifest));
for(const id of Object.keys(registry.characters))for(const key of ['portrait','avatar','sheet'])assert.equal(rebuilt.characters[id][key],manifest.characters[id][key],id+' rebuild must preserve the selected source and existing walk sheet');
console.log('PASS portraits: 25 source records, 50 formal hashes/PNG dimensions/binary alpha/palette limits, source metadata, and rebuild preservation without changing walking sheets.');
