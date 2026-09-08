/**
 * El CSV que la oficina abre en Excel para facturar.
 *
 * Vivía adentro de `routes/reports.ts`, donde no se podía probar: sale acá porque las reglas
 * de escapado son justo las que rompen en silencio, y en silencio es como llegan a una
 * planilla de la que se factura.
 */

/** El separador de columnas. Es `;` porque el Excel de acá está en español. */
const SEP = ";";

/**
 * Una celda, lista para el archivo.
 *
 * Dos reglas que se pisaban entre sí. Un número sale con COMA decimal, porque con punto el
 * Excel en español lo entra como texto (o peor, como fecha) y la columna no se puede sumar.
 * Y el escapado miraba —entre otros— la coma, así que entrecomillaba esa misma celda: los
 * enteros salían limpios y TODO decimal salía entre comillas, que es exactamente el valor que
 * la conversión venía a arreglar. La coma no necesita comillas: el separador es `;`.
 *
 * Y una regla nueva: una celda de texto que arranca con `=`, `+`, `-` o `@` la ejecuta el
 * Excel como fórmula al abrir el archivo. `Observaciones` es texto libre del chofer y esto lo
 * abre la oficina del cliente, así que se neutraliza con un apóstrofo —que Excel se come al
 * mostrar— en vez de dejarla pasar. Los números no pasan por acá: un negativo sigue siendo
 * un negativo.
 */
export function csvCell(v: unknown): string {
  if (v == null) return "";

  if (typeof v === "number") {
    // Sin comillas: es lo único que hace que el Excel lo tome como número.
    return String(v).replace(".", ",");
  }

  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /["\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvResponse(filename: string, rows: (string | number | null)[][]): Response {
  // El BOM es lo que hace que el Excel abra los acentos bien.
  const body = "﻿" + rows.map((r) => r.map(csvCell).join(SEP)).join("\r\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
