// 统一报告：同一份结构化结果既给人读，也写进 evidence/*.json。
// 严重度只有 error/warning/note：error 阻塞收包，warning 需作者确认，note 是事实记录。

export class Report {
  constructor({packageId, packageDir, repoRoot} = {}) {
    this.packageId = packageId ?? null;
    this.packageDir = packageDir ?? null;
    this.repoRoot = repoRoot ?? null;
    this.startedAt = new Date().toISOString();
    this.items = [];
    this.facts = {};
    this.checks = {};
  }

  _add(severity, code, message, detail = {}) {
    const item = {severity, code, message, ...detail};
    this.items.push(item);
    return item;
  }

  error(code, message, detail) {
    return this._add('error', code, message, detail);
  }

  warn(code, message, detail) {
    return this._add('warning', code, message, detail);
  }

  note(code, message, detail) {
    return this._add('note', code, message, detail);
  }

  markCheck(name, status, detail = {}) {
    this.checks[name] = {status, ...detail};
  }

  get errors() {
    return this.items.filter((i) => i.severity === 'error');
  }

  get warnings() {
    return this.items.filter((i) => i.severity === 'warning');
  }

  get ok() {
    return this.errors.length === 0;
  }

  finish() {
    this.finishedAt = new Date().toISOString();
    return this.toJSON();
  }

  toJSON() {
    return {
      tool: 'CV6-17 delivery-check',
      toolVersion: '1.0.0',
      packageId: this.packageId,
      packageDir: this.packageDir,
      repoRoot: this.repoRoot,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt ?? null,
      ok: this.ok,
      counts: {
        error: this.errors.length,
        warning: this.warnings.length,
        note: this.items.filter((i) => i.severity === 'note').length
      },
      checks: this.checks,
      facts: this.facts,
      items: this.items
    };
  }

  /** 终端可读摘要：只列 error/warning，note 不外溢。 */
  toText() {
    const lines = [];
    lines.push(`包：${this.packageId ?? '(未命名)'}  仓库：${this.repoRoot ?? '(未知)'}`);
    const header = Object.entries(this.checks)
      .map(([name, value]) => `${name}=${value.status}`)
      .join('  ');
    if (header) lines.push(`检查：${header}`);
    for (const key of Object.keys(this.facts)) {
      const value = this.facts[key];
      if (value === null || value === undefined) continue;
      lines.push(`· ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
    }
    const failing = this.items.filter((i) => i.severity !== 'note');
    if (!failing.length) {
      lines.push('结论：通过（无 error / warning）');
    } else {
      lines.push('结论：' + (this.ok ? '有 warning，可收包但需作者确认' : '存在 error，不可收包'));
      for (const item of failing) {
        const where = [item.file, item.line ? `:${item.line}` : ''].filter(Boolean).join('');
        lines.push(`  [${item.severity}] ${item.code} ${where ? `${where} ` : ''}${item.message}`);
      }
    }
    return lines.join('\n');
  }
}
