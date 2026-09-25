#!/usr/bin/env node
/**
 * Frena el deploy si el árbol de trabajo no está limpio.
 *
 * `npm run build` compila los archivos como están en el disco, no el último commit. El 25/9/2026
 * se desplegó a producción código a medio escribir de otra sesión que estaba trabajando en los
 * mismos archivos: el árbol tenía cambios sin commitear y nadie los miró antes de compilar.
 *
 * El control no puede depender de que quien despliega se acuerde de mirar. Acá se acuerda solo.
 *
 * Cuenta como sucio cualquier cosa que devuelva `git status --porcelain`, incluidos los archivos
 * sin agregar: el caso que nos mordió fue una pantalla nueva sin trackear que un archivo
 * modificado ya importaba, así que entró en el paquete igual.
 *
 * Para desplegar a propósito con el árbol sucio —un arreglo de urgencia, por ejemplo— va
 * TSM_DESPLEGAR_ARBOL_SUCIO=1. Tiene ese nombre largo para que nadie lo escriba sin querer.
 */
import { execSync } from "node:child_process";

if (process.env.TSM_DESPLEGAR_ARBOL_SUCIO === "1") {
  console.warn("Árbol sucio permitido a propósito (TSM_DESPLEGAR_ARBOL_SUCIO=1). Mirá bien qué estás subiendo.");
  process.exit(0);
}

let salida;
try {
  salida = execSync("git status --porcelain", { encoding: "utf8" });
} catch {
  console.error("No se pudo preguntarle a git cómo está el árbol, así que no despliego a ciegas.");
  process.exit(1);
}

if (salida.trim()) {
  console.error("");
  console.error("No despliego: hay cambios sin commitear y el build los subiría a producción.");
  console.error("");
  console.error(salida.trimEnd());
  console.error("");
  console.error("Commiteá lo que va, guardá el resto con `git stash --include-untracked`, y volvé a intentar.");
  console.error("");
  process.exit(1);
}
