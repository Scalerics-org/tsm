# Spec — Viajes flexibles (libreta, renglones y facturación automática)

> Estado: propuesta técnica · v3 · Autor: Scalerics · Proyecto: TSM (Transporte Santa María)
> Alcance: extensión sobre la app base ya funcionando (Casarone, Nayna, Molino).
>
> **v2:** el "historial autocompletado" se reemplaza por una **libreta curada**; los 3 modos de campo se reducen
> a **2**; la regla de cobro pasa del renglón a la **libreta** (deja de ser trabajo manual diario); se agrega
> **N° de remito por renglón** y **edición de viajes cerrados**.
>
> **v3:** la regla de cobro pasa a ser **por combinación remitente+destinatario** (§2.3) para no heredar valores
> equivocados en silencio; se prohíbe **"Varios" dentro de un renglón** (§2.4), que anulaba el propósito de la
> función; las 4 preguntas al cliente se reducen a **1** (§10).

## 1. Objetivo

Cubrir los viajes que no entran en el modelo simple:

1. **Internacionales precargados** (TYCSUR, Minabel): origen variable, destino fijo (Mdeo), remitente/lugar de carga y destinatario a completar.
2. **Datos que se repiten**: el 90 %+ de los viajes usa los mismos remitentes y destinatarios — no deben reescribirse nunca.
3. **Viajes combinados** (Mdeo–Bella Unión, "varios"): un viaje que carga en varios lugares, cada uno con su remitente y su cliente; parte se cobra al cliente y parte al proveedor.

Restricciones que mandan sobre el diseño:

- El chofer **no ve ni toca** nada de facturación.
- A la oficina **no se le puede perder** una carga ni un cobro.
- Lo que se agregue **no puede generar trabajo manual diario**, o se abandona.

---

## 2. Idea central

Dos piezas, y todo lo demás sale de ahí.

### 2.1 Dos modos de campo (antes eran tres)

| Modo | Qué hace | Ejemplo |
|------|----------|---------|
| `fijo` | Valor definido en la plantilla; el chofer no lo toca | Casarone → remitente "Casarone" |
| `libreta` | Elige de una lista curada; puede dar de alta si `permite_alta` | Remitentes de TYCSUR, destinatarios de Bella Unión |

> **Por qué se cayó el tercer modo.** En v1 existían `opciones` (lista cerrada) y `manual` (texto libre con historial).
> Con la libreta son **la misma cosa**: una lista a la que se puede agregar. "Manual" queda expresado como
> `libreta` + `permite_alta: true` + sin precargar. Menos conceptos, menos código, menos superficie de error.

### 2.2 La libreta reemplaza al historial

Un historial pasivo (guardar lo que se tipeó) genera duplicados —`Cruce Poloeste` / `polo este` / `POLOESTE`— y eso **fragmenta los reportes de facturación**, que es justo para lo que se usan estos datos.

La libreta es la misma UX para el chofer (busca, filtra, elige) pero **curada**: precargada, con alta marcada como *nueva* para revisión, y con operaciones de **renombrar / fusionar / borrar** desde la oficina.

**Además, la libreta es donde vive la regla de facturación** (§2.3).

### 2.3 La regla de cobro va en la libreta (por combinación), no en el renglón

En v1, la oficina etiquetaba "se cobra a" en **cada renglón de cada viaje**. Con ~10 viajes/día × 3 renglones son ~30 acciones manuales diarias: se abandona en semanas y los datos dejan de servir.

Como el par remitente/destinatario se repite en el 90 %+ de los casos, **la regla de cobro se repite con él**. Entonces:

- La regla se guarda en una tabla `cobro_reglas`, **con clave el par `remitente + destinatario`**.
- Al crear un renglón, **el cobro se hereda automáticamente** de la regla que matchea.
- La oficina **solo interviene en las excepciones** (override manual, queda marcado).

Trabajo diario recurrente: **cero**.

> **Por qué por par y no solo por remitente.** Un mismo remitente puede cobrarse distinto según a dónde vaya
> (`Armco → Varios Clientes` = cliente, pero `Armco → Galpón` = proveedor). Una regla por remitente solo
> **heredaría el valor equivocado en silencio**, que es peor que no tener regla: la oficina factura mal confiando
> en el dato. La clave por par puede expresar una regla por remitente (dejando el destinatario en `*`), pero no al revés.
> **Pendiente de confirmar con el cliente** (§10.1): si el cobro depende únicamente de quién entrega, se simplifica.

### 2.4 "Varios" no es un remitente válido dentro de un renglón

`Varios` puede ser el nombre de la **plantilla** (`Mdeo → Bella Unión (Varios)`), pero **nunca el remitente
de un renglón**. Si lo fuera, el chofer lo elegiría por ser la opción más rápida y el renglón no registraría
nada — que es exactamente el problema que estos viajes vienen a resolver
(*"tengo miedo que se me pierda info de carga… porque en esos viajes donde va a decir varios…"*).

**La restricción es asimétrica, y a propósito:**

| Lado | Regla | Por qué |
|------|-------|---------|
| **Remitente** (carga) | Debe ser una entidad real | Es lo que determina a quién se factura. Acá no se puede perder nada. |
| **Destinatario** (entrega) | Puede ser grueso (`Varios Clientes`) | En Bella Unión reparte a muchos clientes chicos; enumerarlos serían 20 renglones y el chofer lo abandona. |

Esto es coherente con que **el renglón se ancla en la carga, no en la entrega**: él carga en 2 o 3 lugares
pero reparte en muchos, y su preocupación de cobro es sobre las cargas.

Implementación: las entradas marcadas `agrupador: true` no se ofrecen como remitente de un renglón
(`GET /libreta?seleccionables=1`).

---

## 3. Modelo de datos

### 3.1 Campo de ubicación

```ts
type CampoModo = "fijo" | "libreta";

interface CampoUbicacion {
  label: string;             // "Remitente / Lugar de carga"
  modo: CampoModo;
  valor?: string;            // si modo = "fijo"
  libreta_tipo?: LibretaTipo;// si modo = "libreta"
  permite_alta?: boolean;    // el chofer puede agregar una entrada nueva (default true)
  requerido?: boolean;       // default true
}
```

### 3.2 Libreta (reemplaza `field_history` de v1)

```ts
type LibretaTipo = "remitente" | "destinatario" | "lugar";
type CobroTipo   = "cliente" | "proveedor";
type LibretaEstado = "confirmado" | "nuevo";  // "nuevo" = alta del chofer, pendiente de revisión

interface LibretaEntry {
  id: number;
  tipo: LibretaTipo;
  nombre: string;
  provider_id: number | null;   // null = disponible para todos los clientes
  agrupador: boolean;           // true = "Varios" y similares: NO seleccionable en renglones
  estado: LibretaEstado;
  usos: number;                 // para ordenar por frecuencia
  created_by: number | null;    // driver_id que la dio de alta
}
```

```sql
CREATE TABLE libreta (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo        TEXT    NOT NULL,
  nombre      TEXT    NOT NULL,
  provider_id INTEGER REFERENCES providers(id) ON DELETE CASCADE,
  agrupador   INTEGER NOT NULL DEFAULT 0,
  estado      TEXT    NOT NULL DEFAULT 'confirmado',
  usos        INTEGER NOT NULL DEFAULT 0,
  created_by  INTEGER REFERENCES drivers(id),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tipo, nombre, provider_id)
);
CREATE INDEX idx_libreta_lookup ON libreta(tipo, provider_id, usos DESC);

-- Regla de facturación por combinación. destinatario_id NULL = "cualquier destino".
CREATE TABLE cobro_reglas (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  remitente_id    INTEGER NOT NULL REFERENCES libreta(id) ON DELETE CASCADE,
  destinatario_id INTEGER REFERENCES libreta(id) ON DELETE CASCADE,
  cobro_tipo      TEXT NOT NULL,   -- 'cliente' | 'proveedor'
  cobro_a         TEXT NOT NULL,
  UNIQUE(remitente_id, destinatario_id)
);
```

**Alcance recomendado:** entradas **por cliente** (`provider_id`) con opción global (`null`). Al chofer le aparecen primero las de su cliente, no una lista de 200.

**Fusionar duplicados:** `POST /libreta/:id/merge {into_id}` reapunta los viajes existentes al destino y borra el duplicado. Es lo que mantiene los reportes limpios.

### 3.3 Renglón (viajes combinados)

```ts
interface RenglonCampo {              // definición, en la plantilla
  key: string;                        // "remitente" | "destinatario" | "remito" | "toneladas"…
  label: string;
  tipo: "ubicacion" | "texto" | "numero";
  ubicacion?: CampoUbicacion;
  requerido?: boolean;
}

interface TripSegment {               // valor cargado, por renglón
  valores: Record<string, string>;    // { remitente, destinatario, remito, toneladas }
  // Facturación — heredada de la libreta, NO la toca el chofer:
  cobro_tipo: CobroTipo | null;
  cobro_a: string | null;
  cobro_manual: boolean;              // true = la oficina la sobreescribió
}
```

> **Validado contra el Excel del cliente:** sus filas ya son `remitente → destinatario` por línea
> (`Solo Armco | Mdeo | Armco | Bella Unión | Varios Clientes`). El renglón es literalmente una fila de su planilla.

**N° de remito por renglón** (opcional pero presente): en los viajes "varios" no se pide foto porque es documentación excesiva — pero sin *nada* queda sin respaldo para facturar. Un número se escribe en 5 segundos; 10 fotos llevan 5 minutos. Además, **foto opcional** (no obligatoria) por si el chofer quiere dejar constancia de algo raro.

### 3.4 Plantilla

```ts
interface TripTemplate {
  id: number;
  provider_id: number;
  name: string;
  cargo_type: string;

  origen: CampoUbicacion;
  remitente: CampoUbicacion;

  destino_modo: "vinculado" | "separado";
  dest_options?: DestOption[];     // "vinculado": pares destino+destinatario (Molino hoy)
  destino?: CampoUbicacion;        // "separado"
  destinatario?: CampoUbicacion;   // "separado"

  fields: TemplateField[];         // remito, MIC, toneladas…

  multi_renglon: boolean;
  renglon_campos?: RenglonCampo[];

  foto_carga_requerida: boolean;      // false en los "varios"
  arrival_photo_label: string | null; // null = sin foto de descarga
  active: boolean;
}
```

`vinculado` conserva el comportamiento actual de Molino; `separado` habilita TYCSUR (destino fijo Mdeo, destinatario de libreta).

### 3.5 Viaje

```ts
interface Trip {
  // …campos actuales…
  segments?: TripSegment[];   // vacío en viajes simples
  edited_by?: number | null;  // auditoría de edición desde oficina
  edited_at?: string | null;
}
```

---

## 4. Backend

### 4.1 Endpoints

| Método | Ruta | Rol | Descripción |
|--------|------|-----|-------------|
| `GET` | `/api/libreta?tipo=&provider=` | todos | Entradas ordenadas por uso (para el selector del chofer) |
| `POST` | `/api/libreta` | chofer+ | Alta rápida → entra con `estado: "nuevo"` |
| `PUT` | `/api/libreta/:id` | oficina | Renombrar, confirmar, setear `cobro_tipo`/`cobro_a` |
| `POST` | `/api/libreta/:id/merge` | oficina | Fusiona en `into_id` y reapunta viajes |
| `DELETE` | `/api/libreta/:id` | admin | Borrar |
| `POST` | `/api/trips` | chofer | Acepta `segments[]`; **hereda el cobro** de cada entrada de libreta |
| `PUT` | `/api/trips/:id/segments` | oficina | **Editar renglones de un viaje ya cerrado** (corregir remitente, agregar renglón olvidado). Registra `edited_by`/`edited_at` |
| `GET` | `/api/reports/trips.csv` | oficina | Una fila por renglón (§6) |

### 4.2 Herencia del cobro (al crear el renglón)

```
para cada renglón:
  rem  = libreta.buscar("remitente",    renglón.remitente,    provider_id)
  dest = libreta.buscar("destinatario", renglón.destinatario, provider_id)

  regla = cobro_reglas.buscar(rem.id, dest.id)          # match exacto del par
       ?? cobro_reglas.buscar(rem.id, NULL)             # fallback: regla del remitente

  si regla → renglón.cobro_tipo/cobro_a = los de la regla
  si no    → quedan null y el renglón entra en "Pendientes de asignar"
  renglón.cobro_manual = false
```

La oficina ve un contador de **"renglones sin regla de cobro"** — ahí está el único trabajo real, y es una vez por combinación nueva, no por viaje.

### 4.3 Validación (server-side, fail-fast)

- Cada `CampoUbicacion` requerido debe traer valor; si es `libreta`, debe existir la entrada o venir con alta.
- Si `multi_renglon`: al menos 1 renglón con sus campos requeridos.
- **Rechazar entradas `agrupador` en los renglones** ("Varios" y similares): el renglón debe nombrar una entidad real.
- Foto de carga solo obligatoria si `foto_carga_requerida`; de descarga solo si `arrival_photo_label != null`.

---

## 5. Frontend

### 5.1 App del chofer — iniciar viaje

1. **Camión** (ya implementado).
2. **Origen / Remitente / Destino / Destinatario** — `fijo` (solo muestra) o `libreta` (buscador que filtra al escribir + botón **"+ Agregar"** si `permite_alta`).
3. **Campos de carga** (remito, MIC, toneladas).
4. **Renglones** (si `multi_renglon`): **"+ Agregar renglón"**, cada uno con remitente + destinatario + N° de remito (+ toneladas/bultos si aplica).
5. **Foto de carga**: solo si la plantilla la pide; opcional si no.

El chofer **nunca ve** `cobro_tipo` ni `cobro_a`.

### 5.2 Panel de oficina

- **Libreta**: ABM, marca de "nuevas" pendientes de revisión, fusionar duplicados, y **la regla de cobro por entrada**.
- **Editor de plantillas**: modo por campo, `permite_alta`, renglones y toggles de foto.
- **Detalle de viaje**: renglones con su cobro heredado; override manual (queda marcado) y **edición de viajes cerrados**.
- **Pendientes**: renglones sin regla de cobro + entradas de libreta nuevas.

---

## 6. Reportes y facturación

La unidad cobrable es el **renglón**.

**Export CSV** — una fila por renglón:

`Viaje ID · Fecha · Origen · Destino · Remitente · Destinatario · N° remito · Toneladas · Se cobra a · Tipo · Chofer · Camión · Estado`

Los viajes simples exportan una fila (el viaje). El resumen por cliente cuenta a nivel renglón, así un combinado suma a varios clientes/proveedores a la vez.

---

## 7. Casos mapeados

### 7.1 TYCSUR (internacional)

```jsonc
{
  "name": "Internacional TYCSUR",
  "origen":       { "label": "Origen", "modo": "libreta", "libreta_tipo": "lugar", "permite_alta": true },
  "remitente":    { "label": "Remitente / Lugar de carga", "modo": "libreta", "libreta_tipo": "remitente", "permite_alta": true },
  "destino_modo": "separado",
  "destino":      { "label": "Destino", "modo": "fijo", "valor": "Uy Mdeo" },
  "destinatario": { "label": "Destinatario / Lugar de descarga", "modo": "libreta", "libreta_tipo": "destinatario", "permite_alta": true },
  "fields": [
    { "key": "nro_mic",   "label": "Nro. MIC",   "type": "numero", "stage": "carga", "required": true },
    { "key": "ton_carga", "label": "Ton. carga", "type": "numero", "stage": "carga", "required": true, "is_weight": true }
  ],
  "multi_renglon": false,
  "foto_carga_requerida": true,
  "arrival_photo_label": "Foto Rto descarga"
}
```

Libreta precargada para `origen`: Arg. Mercedes Ctes., Arg. Rosario, Arg. Gualeguaychú, Arg. Chacabuco, Arg. San Salvador.

### 7.2 Mdeo → Bella Unión (combinado)

```jsonc
{
  "name": "Mdeo → Bella Unión (Varios)",
  "origen":       { "label": "Origen", "modo": "fijo", "valor": "Mdeo" },
  "remitente":    { "label": "Remitente", "modo": "libreta", "libreta_tipo": "remitente" },
  "destino_modo": "separado",
  "destino":      { "label": "Destino", "modo": "fijo", "valor": "Bella Unión" },
  "destinatario": { "label": "Destinatario", "modo": "libreta", "libreta_tipo": "destinatario" },
  "multi_renglon": true,
  "renglon_campos": [
    { "key": "remitente",    "label": "Remitente",    "tipo": "ubicacion", "requerido": true,
      "ubicacion": { "label": "Remitente", "modo": "libreta", "libreta_tipo": "remitente", "permite_alta": true } },
    { "key": "destinatario", "label": "Destinatario", "tipo": "ubicacion", "requerido": true,
      "ubicacion": { "label": "Destinatario", "modo": "libreta", "libreta_tipo": "destinatario", "permite_alta": true } },
    { "key": "remito",       "label": "N° remito",    "tipo": "texto",  "requerido": false },
    { "key": "toneladas",    "label": "Toneladas",    "tipo": "numero", "requerido": false }
  ],
  "foto_carga_requerida": false,
  "arrival_photo_label": null
}
```

Libreta con la regla de cobro ya cargada:

| Remitente | Destinatario | Se factura a |
|-----------|--------------|--------------|
| Armco | Varios Clientes | cliente |
| Armco | Galpón | **proveedor** ← mismo remitente, otro cobro |
| Agencia | Galpón | proveedor |
| Agronorte | *(cualquiera)* | cliente |

El chofer agrega 3 renglones eligiendo remitente y destinatario reales; **el cobro se completa solo**.
`Varios` queda como nombre de la plantilla, no como opción de renglón.

---

## 8. Migraciones

1. `00xx_campos_flexibles.sql` — columnas JSON en `trip_templates` (`origen`, `remitente`, `destino_parte`, `destinatario_parte`, `destino_modo`, `renglon_campos`) + flags `multi_renglon`, `foto_carga_requerida`; `trips.segments`, `trips.edited_by`, `trips.edited_at`. Backfill de las plantillas actuales al nuevo formato.
2. `00xx_libreta.sql` — tabla `libreta` + índice.
3. `00xx_seed_libreta.sql` — precarga de remitentes/destinatarios/lugares reales **con su regla de cobro**.
4. `00xx_seed_plantillas.sql` — TYCSUR, Minabel, Armco/Agencia/Varios.

Compatibilidad: los viajes actuales siguen funcionando; `dest_options` se mantiene para el modo `vinculado`.

---

## 9. Fases (3, no 4)

Al colapsar los modos, la libreta **es** el sistema de campos: las fases 1 y 2 de v1 se unifican.

| Fase | Entrega |
|------|---------|
| **1 — Libreta + campos configurables** | Modos `fijo`/`libreta`, alta desde el celular, curaduría y fusión en oficina, **regla de cobro por entrada**, foto opcional |
| **2 — Renglones + facturación + edición** | `segments`, N° de remito por renglón, herencia de cobro, override, edición de viajes cerrados, export por renglón |
| **3 — Carga de clientes reales** | TYCSUR, Minabel, Armco/Agencia/Varios y el resto |

Cada fase se despliega y se prueba sola, sin romper lo que ya anda.

---

## 10. Decisiones a confirmar

### 10.1 La única que bloquea el modelo de datos

> **Cuando se combinan cargas, ¿a quién se factura depende únicamente de quién entregó la carga,
> o de la combinación entrega + destino?**

- Si es **por combinación** → se implementa `cobro_reglas` como está especificado (opción segura, ya asumida).
- Si es **solo por remitente** → se simplifica: la regla puede vivir en la entrada de libreta y se borra `cobro_reglas`.

Se asume la primera hasta tener respuesta, porque puede representar a la segunda y no al revés.

### 10.2 Resueltas por defecto (no hace falta preguntar)

| Decisión | Default adoptado |
|----------|------------------|
| Alcance de la libreta | Por cliente, con opción de ver todas |
| Toneladas / bultos por renglón | Disponibles y opcionales |
| Foto en combinados | Opcional, siempre habilitada |
| Override manual del cobro | Sí, y queda marcado |

---

## 11. Alcance / nota comercial

Este módulo excede la app base ya presupuestada y se cotiza como **extensión**. Recomendación: arrancar el **piloto** con lo que ya funciona (Casarone, Nayna, Molino) y montar este módulo enseguida, en el orden de fases.
