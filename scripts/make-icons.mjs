// Gera resources/icon.png (256) e resources/tray.png (32): um post-it amarelo com a pontinha dobrada.
// PNG escrito à mão (zlib + CRC32), sem dependências. Uso: npm run icons
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

const TABELA = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = TABELA[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (tipo, dados) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(dados.length);
  const corpo = Buffer.concat([Buffer.from(tipo), dados]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo));
  return Buffer.concat([len, corpo, crc]);
};
function png(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const linhas = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    linhas[y * (w * 4 + 1)] = 0;
    rgba.copy(linhas, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(linhas, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const M = 0.08; // margem
const C = 0.28; // tamanho da dobra
const R = 0.12; // raio dos cantos
const NOTA = [255, 210, 63];
const DOBRA = [227, 168, 0];
const LINHA = [138, 106, 0];

function dentroDaNota(x, y) {
  const x0 = M, x1 = 1 - M, y0 = M, y1 = 1 - M;
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  // cantos arredondados (só os 3 que não são o da dobra, e a dobra é recortada abaixo)
  const cx = x < x0 + R ? x0 + R : x > x1 - R ? x1 - R : x;
  const cy = y < y0 + R ? y0 + R : y > y1 - R ? y1 - R : y;
  if ((x - cx) ** 2 + (y - cy) ** 2 > R * R) return false;
  const u = x - (x1 - C), v = y - (y1 - C);
  if (u >= 0 && v >= 0 && u + v > C) return false; // pontinha recortada
  return true;
}
function naDobra(x, y) {
  const u = x - (1 - M - C), v = y - (1 - M - C);
  return u >= 0 && v >= 0 && u + v <= C;
}
function naLinha(x, y) {
  return [[0.34, 0.66], [0.47, 0.72], [0.60, 0.5]].some(([yy, fim]) => y >= yy && y <= yy + 0.045 && x >= 0.2 && x <= fim);
}

function renderizar(tam) {
  const SS = 4;
  const buf = Buffer.alloc(tam * tam * 4);
  for (let py = 0; py < tam; py++) {
    for (let px = 0; px < tam; px++) {
      let a = 0, r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) / tam;
          const y = (py + (sy + 0.5) / SS) / tam;
          if (!dentroDaNota(x, y) && !naDobra(x, y)) continue;
          const cor = naDobra(x, y) ? DOBRA : tam >= 64 && naLinha(x, y) ? LINHA : NOTA;
          a++; r += cor[0]; g += cor[1]; b += cor[2];
        }
      }
      const i = (py * tam + px) * 4;
      if (a) {
        buf[i] = Math.round(r / a); buf[i + 1] = Math.round(g / a); buf[i + 2] = Math.round(b / a);
        buf[i + 3] = Math.round((a / (SS * SS)) * 255);
      }
    }
  }
  return png(tam, tam, buf);
}

mkdirSync(join(RAIZ, 'resources'), { recursive: true });
writeFileSync(join(RAIZ, 'resources', 'icon.png'), renderizar(256));
writeFileSync(join(RAIZ, 'resources', 'tray.png'), renderizar(32));
console.log('ícones gerados em resources/');
