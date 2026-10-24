"""Rebuild the registered user portraits without depending on an external model's work folder."""
from __future__ import annotations
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sys

PROJECT = Path(__file__).resolve().parents[2]

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--source-dir', help='Folder containing the registered transparent PNG originals')
    ap.add_argument('--out', default=str(PROJECT / '.local' / 'portrait-build'))
    ap.add_argument('--ids', help='Comma-separated stable bd-* IDs; defaults to all 25')
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()
    registry = json.loads((PROJECT / 'data/character-portraits.json').read_text(encoding='utf-8'))
    entries = registry['characters']
    ids = args.ids.split(',') if args.ids else list(entries)
    if not ids or any(cid not in entries for cid in ids):
        ap.error('ids must be registered bd-* IDs')
    source = Path(args.source_dir or registry['sourceDirectory']).resolve()
    out = Path(args.out).resolve()
    if out == PROJECT or out in PROJECT.parents or any(p in out.parents or out == p for p in [source, PROJECT/'assets', PROJECT/'data', PROJECT/'tools', PROJECT/'experiments', PROJECT/'deliverables', PROJECT/'.git']):
        ap.error('out must be an isolated build folder, not a source, formal asset or candidate folder')
    checked = []
    for cid in ids:
        entry = entries[cid]
        original = source / entry['sourceFile']
        if hashlib.sha256(original.read_bytes()).hexdigest() != entry['sourceSha256']:
            ap.error('source changed; review head rectangles before rebuilding: '+cid)
        checked.append((cid, entry, original))
    if args.dry_run:
        print(json.dumps({'ids':ids, 'out':str(out), 'method':'retouch', 'palette':64, 'canvases':['128x224','384x672'], 'avatars':[96,128]}, ensure_ascii=False))
        return 0
    for name in ['sources','presets']:
        (out/name).mkdir(parents=True,exist_ok=True)
    shutil.copyfile(PROJECT/'tools/portrait-kit/presets.json', out/'presets/presets.json')
    source_index={'sourceOfTruth':registry['sourceOfTruth'],'characters':[]}
    for cid,entry,original in checked:
        shutil.copyfile(original,out/'sources'/f'{cid}-official.png')
        source_index['characters'].append({'id':cid,'officialName':entry['name'],'band':entry['band'],'sourcePackFile':entry['sourceFile'],'sourcePackSha256':entry['sourceSha256'],'sha256':entry['sourceSha256'],'localFile':f'sources/{cid}-official.png'})
    # Retain other previously staged characters, so partial rebuilds remain auditable.
    previous=out/'sources-index.json'
    if previous.exists():
        older=json.loads(previous.read_text(encoding='utf-8'))
        source_index['characters'].extend(c for c in older.get('characters',[]) if c['id'] not in ids)
    previous.write_text(json.dumps(source_index,ensure_ascii=False,indent=2),encoding='utf-8')
    os.environ['CARD_SHOP_PORTRAIT_WORKDIR']=str(out)
    spec=importlib.util.spec_from_file_location('portrait_engine',PROJECT/'tools/portrait-kit/pixelate_portraits.py')
    engine=importlib.util.module_from_spec(spec);spec.loader.exec_module(engine)
    presets=engine.load_presets()
    report_file=out/'results.json'
    old=json.loads(report_file.read_text(encoding='utf-8')) if report_file.exists() else {}
    history=old.get('history',old.get('runs',[]));failed=0
    for cid,entry,original in checked:
        try:
            for size in [(128,224),(384,672)]:
                rec=engine.convert_one(cid,'retouch',size,64,presets)
                history.append(rec)
                print(f'OK {cid} {size[0]}x{size[1]} {rec["seconds"]}s')
            history.extend(engine.make_avatars(cid,presets,64))
        except Exception as error:
            failed+=1;history.append({'character':cid,'error':str(error)});print(f'FAIL {cid}: {error}',file=sys.stderr)
    old.pop('runs',None);old['history']=history
    report_file.write_text(json.dumps(old,ensure_ascii=False,indent=2),encoding='utf-8')
    engine.build_manifest()
    return 1 if failed else 0

if __name__=='__main__':
    raise SystemExit(main())
