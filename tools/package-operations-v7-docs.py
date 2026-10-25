"""Package V7 collaboration documents only. Does not alter game sources or saves."""
from pathlib import Path
import hashlib
import json
import re
import sys
import zipfile

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'docs/collaboration/operations-v7'
OUT = ROOT / '任务分发/V7-高手挑战与多模式'
BOARD = json.loads((SOURCE / '任务登记.json').read_text(encoding='utf-8'))
CONTRACT = json.loads((SOURCE / '共享合同-v1.json').read_text(encoding='utf-8'))
FIXTURE = json.loads((SOURCE / 'fixtures/协作样例.json').read_text(encoding='utf-8'))
assert BOARD['contract'] == CONTRACT['contract'] == FIXTURE['contract']
assert len(BOARD['tasks']) == 6 and len({t['id'] for t in BOARD['tasks']}) == 6
assert all(not t['waitForOtherCandidates'] and not t['implementedInGame'] for t in BOARD['tasks'])
assert [t['packRetail'] for t in CONTRACT['economy']['tiers']] == [210, 360, 510]
assert sum(CONTRACT['economy']['noSsrStarterBoxCounts'].values()) == 120


def normalized(p):
    return p.read_text(encoding='utf-8-sig').replace('\r\n', '\n').encode('utf-8')


def digest(data):
    return hashlib.sha256(data).hexdigest()


def write(path, data):
    assert path.resolve().is_relative_to(OUT.resolve())
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data.encode('utf-8') if isinstance(data, str) else data)


def as_json(value):
    return json.dumps(value, ensure_ascii=False, indent=2) + '\n'


common = sorted(p for p in SOURCE.rglob('*') if p.is_file() and p.suffix in {'.md', '.json'} and '任务书' not in p.parts and p.name != 'README.md')
source_files = sorted(p for p in SOURCE.rglob('*') if p.is_file())
source_index = [{'path': p.relative_to(ROOT).as_posix(), 'sha256LF': digest(normalized(p))} for p in source_files]
source_hash = digest(as_json(source_index).encode('utf-8'))
all_generated = []


def check_links(paths):
    for p in paths:
        if p.suffix != '.md':
            continue
        for dest in re.findall(r'\[[^\]\n]*\]\(([^)\n]+)\)', p.read_text(encoding='utf-8')):
            if re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*:', dest) or dest.startswith('#'):
                continue
            assert (p.parent / dest.partition('#')[0]).exists(), (p, dest)


def zip_files(target, paths, base):
    target.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for p in sorted(paths):
            entry = zipfile.ZipInfo(p.relative_to(base).as_posix(), (2026, 10, 25, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.external_attr = 0o644 << 16
            archive.writestr(entry, p.read_bytes())
    with zipfile.ZipFile(target) as archive:
        assert archive.testzip() is None


rows = []
for task in BOARD['tasks']:
    category = OUT / task['folder']
    package_files = []
    for p in common:
        target = category / '共享资料' / p.relative_to(SOURCE)
        write(target, normalized(p))
        package_files.append(target)
    own = category / '任务书.md'
    write(own, normalized(SOURCE / task['taskFile']))
    package_files.append(own)
    readme = category / 'README-先读.md'
    write(readme, f'''# {task['id']} {task['title']}

这是一份独立分工包，不是已完成的游戏更新。完整工程基线 `{BOARD['baseCommit']}`；只写 `{task['candidateDir']}`。最终由主模型整合。

1. 读 [本组任务书](任务书.md)，按全部连续工序执行，不问先做哪个。
2. 读 [冻结玩法](共享资料/01-冻结玩法与默认参数.md)、[共享接口](共享资料/02-共享接口与数据归属.md)、[隔离与验收](共享资料/03-实施顺序与整合验收.md)。
3. 按 [统一执行指令](共享资料/统一执行指令.md) 工作；另一组缺实现时用共享合同/fixtures完成本组真实模块、适配与测试，不停等、不写空壳。
4. 按 [交付模板](共享资料/交付模板.md) 交完整候选。当前正式API不等于共享草案，不虚报联调或真实引擎通过。

固定默认：建议售价210/360/510；停产newjiang/offline/standard；初始yijiang；三日高手与次日再战；斗地主5将、2v2八将、BO3与AI同伴；场景底部对话；新剧情暂不写。详细例外和旧档政策以共享资料为准。
''')
    package_files.append(readme)
    meta = category / '分发信息.json'
    write(meta, as_json({'id': task['id'], 'sourceOfTruth': BOARD['sourceOfTruth'], 'contract': BOARD['contract'], 'baseCommit': BOARD['baseCommit'], 'sourceTreeSha256LF': source_hash, 'candidateDir': task['candidateDir'], 'status': 'ready-to-dispatch-not-implemented', 'files': [{'path': p.relative_to(category).as_posix(), 'sha256': digest(p.read_bytes())} for p in package_files]}))
    package_files.append(meta)
    check_links(package_files)
    all_generated.extend(package_files)
    zip_files(OUT / '压缩包' / (task['folder'] + '.zip'), package_files, OUT)
    rows.append(f"| {task['id']} | [{task['title']}]({task['folder']}/README-先读.md) | {task['capability']} | [ZIP](压缩包/{task['folder']}.zip) |")

overview = OUT / 'README.md'
write(overview, '''# V7 独立分工包：高手挑战与多模式

本轮是开发任务，游戏尚未实现。先将各组对应ZIP/文件夹和完整工程交给执行模型，最后主模型统一合并；不需要各组中途等其他模型。

| 包 | 内容与入口 | 能力 | 压缩包 |
| --- | --- | --- | --- |
''' + '\n'.join(rows) + '''

每包包含独立任务书、统一指令、冻结规则、共享接口和fixture。若只有一个高质量模型，优先给D；B/C由标准模型按冻结合同做候选并由主模型审查；F保持独立。

[全部分工ZIP](压缩包/V7-全部任务包.zip)包含六组文件，不内嵌六份ZIP。唯一可编辑源在工程 `docs/collaboration/operations-v7/`，修改后运行 `python tools/package-operations-v7-docs.py` 重新生成。V6不冲突的长期任务保留，重叠规则以V7为准。
''')
all_generated.append(overview)
index = OUT / '分发清单.json'
write(index, as_json({'schemaVersion': 1, 'date': BOARD['date'], 'sourceOfTruth': BOARD['sourceOfTruth'], 'sourceTreeSha256LF': source_hash, 'sourceFiles': source_index, 'tasks': BOARD['tasks'], 'status': BOARD['status']}))
all_generated.append(index)
zip_files(OUT / '压缩包/V7-全部任务包.zip', all_generated, OUT.parent)
check_links(source_files)
check_links([overview])
print(as_json({'output': str(OUT), 'tasks': len(BOARD['tasks']), 'sourceFiles': len(source_files), 'archives': 7, 'links': 'passed', 'fixtureContract': 'passed', 'sourceTreeSha256LF': source_hash}))
