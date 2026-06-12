import fs from 'node:fs';
import path from 'node:path';

export class JsonStore {
  constructor(filename, defaults = {}) {
    this.filename = path.resolve(process.cwd(), filename);
    this.defaults = defaults;
    fs.mkdirSync(path.dirname(this.filename), { recursive: true });
    if (!fs.existsSync(this.filename)) this.write(defaults);
  }

  read() {
    try {
      return JSON.parse(fs.readFileSync(this.filename, 'utf8'));
    } catch {
      return structuredClone(this.defaults);
    }
  }

  write(data) {
    fs.writeFileSync(this.filename, JSON.stringify(data, null, 2));
  }

  update(mutator) {
    const data = this.read();
    const next = mutator(data) ?? data;
    this.write(next);
    return next;
  }
}
