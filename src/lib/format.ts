export function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  // Los timestamps del backend vienen como "YYYY-MM-DD HH:MM:SS" (hora local del server / UTC).
  const d = new Date(iso.replace(" ", "T") + (iso.includes("Z") ? "" : ""));
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-UY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.replace(" ", "T"));
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", year: "numeric" });
}


