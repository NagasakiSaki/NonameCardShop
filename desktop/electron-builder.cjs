const path=require('node:path'),fs=require('node:fs');
// Editable installed sources include a local copy; the development checkout uses config/.
const configFile=path.join(__dirname,'../config/project-layout.cjs');
const layout=require(fs.existsSync(configFile)?configFile:'./config/project-layout.cjs');
module.exports={extraResources:[
  {from:'..',to:'game',filter:[...layout.rootFiles,...layout.directories.map(dir=>dir+'/**/*'),...layout.exclusions]},
  {from:'../node_modules/noname',to:'game/node_modules/noname',filter:['**/*']},
  {from:'../node_modules/dedent',to:'game/node_modules/dedent',filter:['**/*']},
  {from:'build/desktop-source',to:'desktop-source',filter:['**/*']},
]};
