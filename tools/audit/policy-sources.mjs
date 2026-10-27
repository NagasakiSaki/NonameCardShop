// Explicit policy provenance. Read-only; never reads a player profile.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const entries=[
  ['data/backend-rules.json','New-world rules; config.apply stores per-world explicit values'],
  ['data/strength-modes.json','Current three-format/two-round scenario'],
  ['data/ideal-yield-anchors.json','Reviewed skill calibration inputs'],
  ['data/print-editions.json','Frozen issuance rarities and box quotas; not strength grades'],
  ['data/v7/economy-policy.json','V7 default budget and pricing; world strengthPricing overrides pricing'],
  ['data/v7/native-eligibility.json','Mode eligibility and score availability'],
  ['data/long-term-policy.json','Daily challenger cadence, campaign loan and ally/upgrade policy'],
];
export function policySources(){
  const rules=JSON.parse(fs.readFileSync(path.join(root,'data/backend-rules.json'),'utf8'));
  return {version:1,scope:'repository defaults only; not a player-world report',sources:entries.map(([file,role])=>{
    const bytes=fs.readFileSync(path.join(root,file));const json=JSON.parse(bytes);
    return {file,role,version:json.version??null,sha256:createHash('sha256').update(bytes).digest('hex')};
  }),current:{scoring:rules.scoring.method,pricing:rules.strengthPricing.version,tiers:rules.strengthPricing.tiers},
  invalidation:{catalogue:'Per-runtime, complete world.rules JSON key, capacity 3; rebuild on config/restore; modules/data changes require reload',rating:'ratingVersion + scoring/thresholds/modeWeights/strengthFingerprint; scoring files are not print editions',service:'dev/service-health.mjs fingerprints service/bridge code; dev watcher separately reloads modules/data/content',sealed:'Existing physical cards, pack/box contents and paid order snapshots retain stored values'},
  compatibility:['supply-pricing.DEFAULT_STRENGTH_PRICING is historical, not new-world three-tier pricing','initialiseRating migrates recognised old scoring versions only when marker differs','initialiseV7 initialises missing operationsVersion; current-version explicit rules survive reconnect']};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(policySources(),null,2));
