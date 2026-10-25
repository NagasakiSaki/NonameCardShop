"""Rebuild portable CV6 document handoffs; no game/source/save/archive mutations."""
from pathlib import Path
import csv
import hashlib
import io
import json
import os
import re
import sys
import zipfile

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'docs/collaboration/commercial-v6'
CONFIG = json.loads((SOURCE / '模型能力分类.json').read_text(encoding='utf-8'))
BOARD = json.loads((SOURCE / 'task-board.json').read_text(encoding='utf-8'))
OUT = (ROOT / CONFIG['outputRoot']).resolve()
assert OUT.is_relative_to(ROOT / '任务分发'), OUT
ARCHIVE = ROOT / 'docs/archive/旧版分工/2026-10-25'
TASKS = {t['id']: t for t in BOARD['tasks']}
GROUPS = CONFIG['groups']
PRIMARY = {k: g for g in GROUPS for k in g['primaryTasks']}
assert len(PRIMARY) == sum(len(g['primaryTasks']) for g in GROUPS) == len(TASKS)
assert set(PRIMARY) == set(TASKS)
SPLIT = set(CONFIG['splitTasks'])
assert SPLIT == set(next(g for g in GROUPS if g['id'] == 'standard')['implementationTasks'])
generated = set()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def normalized(path):
    return re.sub(r'\r+\n', '\n', path.read_bytes().decode('utf-8-sig')).replace('\r', '').encode('utf-8')


def write(path, data):
    path = path.resolve()
    assert path.is_relative_to(OUT), path
    if isinstance(data, str):
        data = data.encode('utf-8')
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    generated.add(path)


def json_text(obj):
    return json.dumps(obj, ensure_ascii=False, indent=2) + '\n'


def rel(path, start):
    return os.path.relpath(path, start).replace('\\', '/')


def portable_links(data, old, new, shared, category):
    def replace(match):
        dest = match.group(2)
        if re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*:', dest) or dest.startswith('#'):
            return match.group(0)
        name, sep, anchor = dest.partition('#')
        target = (old.parent / name).resolve()
        if target.is_relative_to(SOURCE):
            mapped = shared / target.relative_to(SOURCE)
        elif target == OUT / 'README.md':
            mapped = category / 'README-先读.md'
        else:
            # Current source has no other local links. Avoid shipping broken paths.
            raise ValueError(f'Unmapped document link: {old} -> {dest}')
        return match.group(1) + rel(mapped, new.parent) + (sep + anchor if sep else '') + match.group(3)
    return re.sub(r'(\[[^\]\n]*\]\()([^\)\n]+)(\))', replace, data.decode('utf-8')).encode('utf-8')


source_files = sorted(p for p in SOURCE.rglob('*') if p.is_file() and p.suffix in {'.md', '.json'})
source_index = [{'path': p.relative_to(ROOT).as_posix(), 'sha256LF': sha(normalized(p))} for p in source_files]
tree_hash = sha(json_text(source_index).encode('utf-8'))

role_rules = {
    'fast': '只做本组研究、台本、内容配置和固定流程采样。需要写运行器/校验器时列缺口并交标准代码模型，不修改权威规则。02需浏览器/脚本工具；没有工具只能交静态计划，不能声称试玩通过。',
    'standard': '完整实现本组主任务；另可承接“高风险包实现工序”中的8包。先做纯模块/样例/测试，按强推理角色冻结的接口接入。高风险子工序只写对应包implementation目录，不能自行裁决奖励/迁移/可信事件政策。',
    'reasoning': '除16独立全项目审计外，本组重点是接口冻结、风险评审和独立验收，不要求代写整包。源码实现与自测优先交标准代码模型。没有外部强模型时，主模型只做这些小门槛；同包作者不得自称独立审计。',
    'vision': '必须实际看图/截图并可运行素材或地图工具，不按模型名称判断视觉能力。不必使用最强推理模型；代码/数据部分可交标准模型，视觉报告必须有代表截图。',
}

for group in GROUPS:
    category = OUT / group['folder']
    shared = category / '共享资料/docs/collaboration/commercial-v6'
    for src in source_files:
        dest = shared / src.relative_to(SOURCE)
        data = normalized(src)
        if src.suffix == '.md':
            data = portable_links(data, src, dest, shared, category)
        write(dest, data)
    rows = []
    for task_id in group['primaryTasks']:
        task = TASKS[task_id]
        src = SOURCE / task['taskFile']
        dest = category / '任务书' / src.name
        narrow = task_id in SPLIT and group['id'] == 'reasoning'
        scope = f'本副本只分配合同/风险审查/独立验收，写 `deliverables/commercial-v6/{task_id}/review/`。完整任务书供上下文；实现由标准代码模型写同包implementation。' if narrow else '本副本分配完整任务；按任务书执行。16必须保持独立。'
        banner = f'> 分发角色：{group["title"]}。{scope}\n> 独立解压时，共用文档位于本组“共享资料/docs/collaboration/commercial-v6/”；它替代任务书中工程内的同名路径。其余任务书只读参考，不能扩范围。\n\n'
        write(dest, banner + normalized(src).decode('utf-8'))
        rows.append(f'- [{task_id} {task["title"]}](任务书/{src.name})' + ('（仅合同/审查阶段）' if narrow else ''))
    impl_rows = []
    for task_id in group['implementationTasks']:
        task = TASKS[task_id]
        src = SOURCE / task['taskFile']
        dest = category / '高风险包实现工序' / src.name
        banner = f'> 分发角色：标准代码模型，实施 `{task_id}` 的纯模块、候选实现与自测。只写 `deliverables/commercial-v6/{task_id}/implementation/`；不要写review或另一作者文件。\n> 先交输入输出/成功失败小样例；政策待冻结时不填假成功。强推理角色负责合同裁决及独立风险验收，17在自己的目录汇总两份交付。\n> 共用文档见本组“共享资料/docs/collaboration/commercial-v6/”。\n\n'
        write(dest, banner + normalized(src).decode('utf-8'))
        impl_rows.append(f'- [{task_id} {task["title"]}](高风险包实现工序/{src.name})')
    readme = f'''# {group['title']}：本包先读

{role_rules[group['id']]}

这是待下发任务文档，未自动指派或开始实施。只执行用户点名的一个包/阶段，不因为共享资料包含26包就同时开展。

## 可以直接复制给模型的话

请先读本文件，再读用户指定的任务书。共用规范见本组 `共享资料/docs/collaboration/commercial-v6/`。只做本文件指定的角色/阶段与可写目录，先记录实际基线；交完整候选、DELIVERY/manifest/gaps和必要证据。不要提交正式工程、清存档、覆盖原图、更新EXE或自行联系其他模型。高风险实现/审查分目录，不互改。

## 本组任务

'''+ '\n'.join(rows)
    if impl_rows:
        readme += '\n\n## 还可承接的高风险包实现阶段\n\n这些是同包不同阶段，不是第二次实现。没有冻结接口先做纯模块/样例；用户点名后再执行。\n\n' + '\n'.join(impl_rows)
    readme += '''

## 共用上下文

[最新总分工](共享资料/docs/collaboration/commercial-v6/README.md)、[剧情总纲](共享资料/docs/collaboration/commercial-v6/01-剧情总纲与具体线路.md)、[工具规格](共享资料/docs/collaboration/commercial-v6/02-剧情编辑工具规格.md)、[运行与世界接口](共享资料/docs/collaboration/commercial-v6/03-剧情与店外世界接口.md)、[接入规程](共享资料/docs/collaboration/commercial-v6/04-分工排期与接入规程.md)、[验收](共享资料/docs/collaboration/commercial-v6/05-完整产品验收.md)。

本压缩包只有任务与共享文档，不含游戏源码、素材、内核或玩家档。同机模型按原工程只读输入工作；异机模型需用户提供对应任务的最小源码，不能凭任务书假设API已存在。共享目录中的其他包只是上下文，不是已分配给你。不要编辑分发副本；正式任务源在原工程docs/collaboration/commercial-v6，改源后重建。
'''
    write(category / 'README-先读.md', readme)
    write(category / '分发信息.json', json_text({'date': CONFIG['date'], 'group': group['id'], 'role': group['title'], 'primaryTasks': group['primaryTasks'], 'implementationTasks': group['implementationTasks'], 'sourceTreeSha256LF': tree_hash, 'status': 'not-assigned'}))

table = ['| 文件夹 | 适合能力 | 主任务/阶段 |', '| --- | --- | --- |']
for group in GROUPS:
    summary = '、'.join(k.replace('CV6-', '') for k in group['primaryTasks'])
    table.append(f'| [{group["folder"]}]({group["folder"]}/README-先读.md) | {group["title"]} | {summary} |')
write(OUT / 'README.md', '''# CV6 按模型能力分类：转交入口

2026-10-25。只整理和打包，不自动派发任务，不修改游戏功能。26个任务按角色分级；智能档次、代码能力、工具权限和看图能力是不同条件。

'''+'\n'.join(table)+'''

强推理组的8个高风险包已分成“标准代码模型实施”和“强推理模型合同/风险审查”，分别写implementation/review，避免强模型重写整包。16单独做独立审计。没有额外强模型时，主模型只保留这些关键门槛，其他作者继续交可测候选。

建议先发：高速组CV6-19；标准组CV6-17A，并可准备CV6-21A/24A的样例；强推理角色审21/24的合同。依赖只读上下文不等于任务已下发，同一包不要重复分配两个实现作者。

## 怎么给模型

打开对应文件夹，把`README-先读.md`和点名任务交给模型；同机有工程时直接给路径，异机可发对应ZIP。每组共享资料完整保留V6文档与示例，模型只需读任务指定部分；不必再翻旧版本。

各组ZIP和总包见 [压缩包目录](压缩包/README.md)。这些包不包含游戏源码/素材/内核/玩家存档；异机代码模型仍需最小相关源码。

旧分工已移至工程`docs/archive/旧版分工/2026-10-25/`。用户有未提交改动的美术交接原文保留原地，归档仅收已提交版本。旧deliverables未动；归档不代表未完成任务自动结束。

本目录由`python tools/package-collaboration-docs.py`生成；唯一任务真源仍在`docs/collaboration/commercial-v6/`，不要改分发副本。索引/清单保存来源指纹，后续改源重打包。
''')

csv_io = io.StringIO(newline='')
writer = csv.writer(csv_io)
writer.writerow(['包号', '任务', '主分类', '实现角色', '审查角色', '前置', '任务源', '源文本SHA256-LF'])
for task_id, task in TASKS.items():
    group = PRIMARY[task_id]
    writer.writerow([task_id, task['title'], group['title'], '标准代码模型/implementation' if task_id in SPLIT else group['title'], '强推理/review' if task_id in SPLIT else '独立验收', ','.join(task['dependsOn']), f'docs/collaboration/commercial-v6/{task["taskFile"]}', sha(normalized(SOURCE / task['taskFile']))])
write(OUT / '分工索引.csv', csv_io.getvalue().encode('utf-8-sig'))

zip_names = [g['folder'] + '.zip' for g in GROUPS] + ['CV6-全部分类任务包.zip', '99-旧版分工归档-勿作为新任务.zip']
write(OUT / '压缩包/README.md', '# 可直接转交的 ZIP\n\n' + '\n'.join(f'- [{name}]({name})' for name in zip_names) + '\n\n总包包含四类文档；不再内嵌四个分类ZIP。99只用于历史查询，不含当前游戏/素材/存档，跨工程历史引用需在原工程查看。\n')
write(OUT / '分发清单.json', json_text({'date': CONFIG['date'], 'sourceOfTruth': CONFIG['sourceOfTruth'], 'sourceTreeSha256LF': tree_hash, 'sourceFiles': source_index, 'groups': GROUPS, 'status': 'planning-only-not-assigned'}))


def zip_files(target, paths, base):
    target.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for path in sorted(paths):
            info = zipfile.ZipInfo(path.relative_to(base).as_posix(), (2026, 10, 25, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            zf.writestr(info, path.read_bytes())
    with zipfile.ZipFile(target) as zf:
        assert zf.testzip() is None


for group in GROUPS:
    category = OUT / group['folder']
    zip_files(OUT / '压缩包' / (group['folder'] + '.zip'), [p for p in generated if p.is_relative_to(category)], OUT)
zip_files(OUT / '压缩包/CV6-全部分类任务包.zip', [p for p in generated if not p.is_relative_to(OUT / '压缩包')], OUT.parent)
zip_files(OUT / '压缩包/99-旧版分工归档-勿作为新任务.zip', [p for p in ARCHIVE.rglob('*') if p.is_file()], ARCHIVE.parent)
print(json_text({'output': str(OUT), 'sourceDocuments': len(source_files), 'uniqueTasks': len(TASKS), 'classifiedDocuments': len(generated), 'archives': [{'name': n, 'bytes': (OUT / '压缩包' / n).stat().st_size} for n in zip_names]}))
