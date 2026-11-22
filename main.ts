// main.ts — tiny stack VM. One run answers i001..i040 (see ISA.md).

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

// Opcode -> immediate length, -1 for unknown opcodes.
const ILEN = new Int8Array(256).fill(-1);
for (let o = 0; o <= 7; o++) ILEN[o] = 0;
for (let o = 0x10; o <= 0x1e; o++) ILEN[o] = 0;
ILEN[0x20] = ILEN[0x21] = ILEN[0x22] = ILEN[0x34] = ILEN[0x40] = ILEN[0x41] = 0;
for (let o = 0x50; o <= 0x53; o++) ILEN[o] = 0;
ILEN[0x01] = 1; ILEN[0x02] = 4;
for (let o = 0x30; o <= 0x33; o++) ILEN[o] = 2;

// Run one program. A trap ends it with the trap's code; prior output kept.
function run(prog: Uint8Array, inp: Uint8Array): [Uint8Array, number] {
  const n = prog.length;
  const st = new Int32Array(256);
  let sp = 0;
  const cs = new Int32Array(64);
  let cp = 0;
  const mem = new Int32Array(256);
  const out = new Uint8Array(65536);
  let ol = 0;
  let ip = 0;
  let pc = 0;
  let steps = 0;
  const done = (code: number): [Uint8Array, number] => [out.slice(0, ol), code];
  for (;;) {
    if (steps === 1000000) return done(10);
    if (pc < 0 || pc >= n) return done(9);
    const op = prog[pc];
    const il = ILEN[op];
    if (il < 0) return done(5);
    if (pc + 1 + il > n) return done(9);
    steps++;
    switch (op) {
      case 0x00: return done(0);
      case 0x01: {
        if (sp === 256) return done(3);
        st[sp++] = (prog[pc + 1] << 24) >> 24;
        pc += 2;
        break;
      }
      case 0x02: {
        if (sp === 256) return done(3);
        st[sp++] = prog[pc + 1] | (prog[pc + 2] << 8) | (prog[pc + 3] << 16) | (prog[pc + 4] << 24);
        pc += 5;
        break;
      }
      case 0x03: if (sp < 1) return done(2); sp--; pc++; break;
      case 0x04: {
        if (sp < 1) return done(2);
        if (sp === 256) return done(3);
        st[sp] = st[sp - 1]; sp++; pc++;
        break;
      }
      case 0x05: {
        if (sp < 2) return done(2);
        const t = st[sp - 1]; st[sp - 1] = st[sp - 2]; st[sp - 2] = t; pc++;
        break;
      }
      case 0x06: {
        if (sp < 2) return done(2);
        if (sp === 256) return done(3);
        st[sp] = st[sp - 2]; sp++; pc++;
        break;
      }
      case 0x07: {
        if (sp < 3) return done(2);
        const a = st[sp - 3], b = st[sp - 2], c = st[sp - 1];
        st[sp - 3] = b; st[sp - 2] = c; st[sp - 1] = a; pc++;
        break;
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
        st[sp - 2] = r; sp--; pc++;
        break;
      }
      case 0x17: if (sp < 1) return done(2); st[sp - 1] = (-st[sp - 1]) | 0; pc++; break;
      case 0x1b: if (sp < 1) return done(2); st[sp - 1] = ~st[sp - 1]; pc++; break;
      case 0x30: case 0x31: case 0x32: {
        let off = prog[pc + 1] | (prog[pc + 2] << 8);
        if (off & 0x8000) off -= 0x10000;
        if (op === 0x30) { pc = pc + 3 + off; break; }
        if (sp < 1) return done(2);
        const v = st[--sp];
        if ((op === 0x31 && v === 0) || (op === 0x32 && v !== 0)) pc = pc + 3 + off;
        else pc += 3;
        break;
      }
      case 0x33: {
        if (cp === 64) return done(7);
        cs[cp++] = pc + 3;
        pc = prog[pc + 1] | (prog[pc + 2] << 8);
        break;
      }
      case 0x34: if (cp === 0) return done(8); pc = cs[--cp]; break;
      case 0x40: {
        if (sp < 1) return done(2);
        const addr = st[sp - 1];
        if (addr < 0 || addr > 255) return done(6);
        st[sp - 1] = mem[addr]; pc++;
        break;
      }
      case 0x41: {
        if (sp < 2) return done(2);
        const addr = st[sp - 1], v = st[sp - 2];
        if (addr < 0 || addr > 255) return done(6);
        mem[addr] = v; sp -= 2; pc++;
        break;
      }
      case 0x50: {
        if (sp < 1) return done(2);
        const s = String(st[--sp]);
        if (ol + s.length > 65536) return done(11);
        for (let i = 0; i < s.length; i++) out[ol++] = s.charCodeAt(i);
        pc++;
        break;
      }
      case 0x51: {
        if (sp < 1) return done(2);
        if (ol + 1 > 65536) return done(11);
        out[ol++] = st[--sp] & 255; pc++;
        break;
      }
      case 0x52: {
        if (sp === 256) return done(3);
        st[sp++] = ip < inp.length ? inp[ip++] : -1; pc++;
        break;
      }
      case 0x53: if (sp < 1) return done(2); return done(st[--sp] & 255);
    }
  }
}

const inRoot = process.argv[2] ?? "/input";
const outRoot = process.argv[3] ?? "/output";

for (let k = 1; k <= 40; k++) {
  const id = "i" + String(k).padStart(3, "0");
  let prog: Uint8Array;
  let inp: Uint8Array;
  try { prog = readFileSync(`${inRoot}/${id}/program.bin`); } catch { prog = new Uint8Array(0); }
  try { inp = readFileSync(`${inRoot}/${id}/input.bin`); } catch { inp = new Uint8Array(0); }
  const [out, code] = run(prog, inp);
  mkdirSync(`${outRoot}/${id}`, { recursive: true });
  writeFileSync(`${outRoot}/${id}/stdout.bin`, out);
  writeFileSync(`${outRoot}/${id}/exit.txt`, String(code));
}
