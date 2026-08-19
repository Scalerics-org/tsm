/**
 * Genera los íconos del PWA sin dependencias.
 *
 * Se escribe el PNG a mano (IHDR/IDAT/IEND con zlib, que viene en Node) en vez de sumar
 * una librería de imágenes al proyecto: son cuatro archivos que se generan una vez y no
 * justifican una dependencia más para mantener.
 *
 *   node scripts/generar-iconos.mjs
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const NAVY = [0x1d, 0x2d, 0x3d]; // brand.900 — el mismo theme-color de la app
const AZUL = [0x94, 0xbc, 0xe3]; // brand.400
const CLARO = [0xf2, 0xf2, 0xf3]; // bg

function crc32(buf) {
  let c,
    tabla = crc32.tabla;
  if (!tabla) {
    tabla = crc32.tabla = [];
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      tabla[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = tabla[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, "ascii"), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
}

/** pintar(x, y, size) devuelve [r,g,b] o null para transparente. */
function png(size, pintar) {
  const filas = [];
  for (let y = 0; y < size; y++) {
    const fila = Buffer.alloc(1 + size * 4); // 1 byte de filtro + RGBA
    for (let x = 0; x < size; x++) {
      const c = pintar(x, y, size);
      const i = 1 + x * 4;
      if (c) {
        fila[i] = c[0];
        fila[i + 1] = c[1];
        fila[i + 2] = c[2];
        fila[i + 3] = 255;
      }
    }
    filas.push(fila);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 8 bits por canal
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(filas), { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * La marca: dos barras diagonales sobre el azul oscuro — la ruta.
 *
 * `margen` deja aire alrededor. En el ícono "maskable" Android recorta hasta un 20% de
 * cada lado para adaptarlo a la forma del launcher, así que ahí la marca va más chica:
 * si ocupa todo, el recorte se la come.
 */
function marca({ fondo, margen }) {
  return (x, y, size) => {
    const r = size * 0.18; // esquinas redondeadas
    if (fondo) {
      const dx = Math.min(x, size - 1 - x);
      const dy = Math.min(y, size - 1 - y);
      if (dx < r && dy < r) {
        const d = Math.hypot(r - dx, r - dy);
        if (d > r) return null; // afuera de la esquina redondeada
      }
    }

    const u = (x / size - 0.5) / (1 - margen * 2);
    const v = (y / size - 0.5) / (1 - margen * 2);
    if (Math.abs(u) > 0.5 || Math.abs(v) > 0.5) return fondo ? NAVY : null;

    // Dos barras paralelas a 45°: d es la distancia a la diagonal.
    const d = u + v;
    const ancho = 0.13;
    if (d > -0.30 && d < -0.30 + ancho) return AZUL;
    if (d > 0.02 && d < 0.02 + ancho) return CLARO;
    return fondo ? NAVY : null;
  };
}

mkdirSync(join(process.cwd(), "public"), { recursive: true });
const archivos = [
  ["icon-192.png", 192, { fondo: true, margen: 0.16 }],
  ["icon-512.png", 512, { fondo: true, margen: 0.16 }],
  // Maskable: el launcher recorta, así que la marca va dentro de la zona segura.
  ["icon-maskable-512.png", 512, { fondo: true, margen: 0.26 }],
  // iOS no aplica transparencia ni redondea por su cuenta en el apple-touch-icon.
  ["apple-touch-icon.png", 180, { fondo: true, margen: 0.16 }],
];
for (const [nombre, size, opts] of archivos) {
  writeFileSync(join(process.cwd(), "public", nombre), png(size, marca(opts)));
  console.log(`  ${nombre.padEnd(26)} ${size}x${size}`);
}
console.log("Íconos generados en public/");
