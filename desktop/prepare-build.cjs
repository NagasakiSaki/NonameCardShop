/* Separate source snapshot prevents extraResources from excluding the app entry. */
const fs=require('node:fs'),path=require('node:path');
const out=path.join(__dirname,'build/desktop-source');
for(const name of ['main.cjs','save-bridge.cjs','package.json','package-lock.json','electron-builder.cjs','prepare-build.cjs','README.md','build/icon.ico','build/icon.png']){const target=path.join(out,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(__dirname,name),target);}
const layout=path.join(out,'config/project-layout.cjs');fs.mkdirSync(path.dirname(layout),{recursive:true});
fs.copyFileSync(path.join(__dirname,fs.existsSync(path.join(__dirname,'../config/project-layout.cjs'))?'../config/project-layout.cjs':'config/project-layout.cjs'),layout);
console.log('Prepared editable desktop source snapshot.');
