// main.ts — tiny stack VM (ISA v1). Answers i001..i040 in one run.
import { readFileSync as rf, writeFileSync as wf, mkdirSync as md } from "node:fs";

function run(p: Uint8Array, inp: Uint8Array): [Uint8Array, number] {
  const st = new Int32Array(256);
  let sp = 0;
  const cs = new Int32Array(64);
  let cp = 0;
  const mem = new Int32Array(256);
  const out = new Uint8Array(65536);
  let ol = 0, ip = 0, pc = 0, steps = 0;
  const n = p.length;
  const done = (c: number): [Uint8Array, number] => [out.slice(0, ol), c];
  for (;;) {
    if (steps === 1000000) return done(10);
    if (pc < 0 || pc >= n) return done(9);
    const op = p[pc];
    steps++;
    switch (op) {
      case 0x00: return done(0);
      case 0x01:
        if (pc + 2 > n) return done(9);
        if (sp === 256) return done(3);
        st[sp++] = (p[pc + 1] << 24) >> 24; pc += 2; break;
      case 0x02:
        if (pc + 5 > n) return done(9);
        if (sp === 256) return done(3);
        st[sp++] = p[pc + 1] | (p[pc + 2] << 8) | (p[pc + 3] << 16) | (p[pc + 4] << 24); pc += 5; break;
      case 0x03: if (sp < 1) return done(2); sp--; pc++; break;
      case 0x04:
        if (sp < 1) return done(2);
        if (sp === 256) return done(3);
        st[sp] = st[sp - 1]; sp++; pc++; break;
      case 0x05:
        if (sp < 2) return done(2);
        const t = st[sp - 1]; st[sp - 1] = st[sp - 2]; st[sp - 2] = t; pc++; break;
      case 0x06:
        if (sp < 2) return done(2);
        if (sp === 256) return done(3);
        st[sp] = st[sp - 2]; sp++; pc++; break;
      case 0x07: {
        if (sp < 3) return done(2);
        const a = st[sp - 3], b = st[sp - 2], c = st[sp - 1];
        st[sp - 3] = b; st[sp - 2] = c; st[sp - 1] = a; pc++; break;
      }
      case 0x10: case 0x11: case 0x12: case 0x13: case 0x14: case 0x15: case 0x16:
      case 0x18: case 0x19: case 0x1a: case 0x1c: case 0x1d: case 0x1e:
      case 0x20: case 0x21: case 0x22: {
        if (sp < 2) return done(2);
        const b = st[sp - 1], a = st[sp - 2];
        let r = 0;
        if (op === 0x10) r = (a + b) | 0;
        else if (op === 0x11) r = (a - b) | 0;
        else if (op === 0x12) r = Math.imul(a, b);
        else if (op === 0x13) { if (b === 0) return done(4); r = (a / b) | 0; }
        else if (op === 0x14) { if (b === 0) return done(4); r = (a % b) | 0; }
        else if (op === 0x15) { if (b === 0) return done(4); r = ((a >>> 0) / (b >>> 0)) | 0; }
        else if (op === 0x16) { if (b === 0) return done(4); r = ((a >>> 0) % (b >>> 0)) | 0; }
        else if (op === 0x18) r = a & b;
        else if (op === 0x19) r = a | b;
        else if (op === 0x1a) r = a ^ b;
        else if (op === 0x1c) r = a << (b & 31);
        else if (op === 0x1d) r = a >> (b & 31);
        else if (op === 0x1e) r = (a >>> (b & 31)) | 0;
        else if (op === 0x20) r = a === b ? 1 : 0;
        else if (op === 0x21) r = a < b ? 1 : 0;
        else r = (a >>> 0) < (b >>> 0) ? 1 : 0;
        st[sp - 2] = r; sp--; pc++; break;
      }
      case 0x17: if (sp < 1) return done(2); st[sp - 1] = (-st[sp - 1]) | 0; pc++; break;
      case 0x1b: if (sp < 1) return done(2); st[sp - 1] = ~st[sp - 1]; pc++; break;
      case 0x30: case 0x31: case 0x32: {
        if (pc + 3 > n) return done(9);
        let off = p[pc + 1] | (p[pc + 2] << 8);
        if (off & 0x8000) off -= 0x10000;
        if (op === 0x30) { pc = pc + 3 + off; break; }
        if (sp < 1) return done(2);
        const v = st[--sp];
        if ((op === 0x31 && v === 0) || (op === 0x32 && v !== 0)) pc = pc + 3 + off;
        else pc += 3;
        break;
      }
      case 0x33:
        if (pc + 3 > n) return done(9);
        if (cp === 64) return done(7);
        cs[cp++] = pc + 3; pc = p[pc + 1] | (p[pc + 2] << 8); break;
      case 0x34: if (cp === 0) return done(8); pc = cs[--cp]; break;
      case 0x40: {
        if (sp < 1) return done(2);
        const addr = st[sp - 1];
        if (addr < 0 || addr > 255) return done(6);
        st[sp - 1] = mem[addr]; pc++; break;
      }
      case 0x41: {
        if (sp < 2) return done(2);
        const addr = st[sp - 1], v = st[sp - 2];
        if (addr < 0 || addr > 255) return done(6);
        mem[addr] = v; sp -= 2; pc++; break;
      }
      case 0x50: {
        if (sp < 1) return done(2);
        const s = String(st[--sp]);
        if (ol + s.length > 65536) return done(11);
        for (let i = 0; i < s.length; i++) out[ol++] = s.charCodeAt(i);
        pc++; break;
      }
      case 0x51:
        if (sp < 1) return done(2);
        if (ol + 1 > 65536) return done(11);
        out[ol++] = st[--sp] & 255; pc++; break;
      case 0x52:
        if (sp === 256) return done(3);
        st[sp++] = ip < inp.length ? inp[ip++] : -1; pc++; break;
      case 0x53: if (sp < 1) return done(2); return done(st[--sp] & 255);
      default: return done(5);
    }
  }
}

const rd = (f: string): Uint8Array => { try { return rf(f); } catch { return new Uint8Array(0); } };
const ir = process.argv[2] ?? process.env.MAKEFUN_INPUT_DIR ?? "/input";
const orr = process.argv[3] ?? process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
for (let k = 1; k <= 40; k++) {
  const id = "i0" + (k < 10 ? "0" + k : k);
  const [o, c] = run(rd(`${ir}/${id}/program.bin`), rd(`${ir}/${id}/input.bin`));
  md(`${orr}/${id}`, { recursive: true });
  wf(`${orr}/${id}/stdout.bin`, o);
  wf(`${orr}/${id}/exit.txt`, String(c));
}
