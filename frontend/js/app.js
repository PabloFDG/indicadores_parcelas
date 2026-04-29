const API_URL = "https://tif-urbanistico.onrender.com";

let mapa = null;
let marcador = null;
let datosActuales = null;

// Enter en el input dispara la búsqueda
document.getElementById("input-dir").addEventListener("keydown", e => {
  if (e.key === "Enter") consultar();
});

// ── Utilidades ────────────────────────────────────────────────────────────
function mostrar(id, display = "flex") {
  document.getElementById(id).style.display = display;
}
function ocultar(id) {
  document.getElementById(id).style.display = "none";
}
function texto(id, val) {
  document.getElementById(id).textContent = val ?? "—";
}
function fmt(n, dec = 0) {
  if (n == null) return "—";
  return Number(n).toLocaleString("es-AR", { maximumFractionDigits: dec });
}

// ── Consulta principal ────────────────────────────────────────────────────
async function consultar() {
  const dir = document.getElementById("input-dir").value.trim();
  if (!dir) return;

  ocultar("results");
  ocultar("address-badge");
  ocultar("error-msg");
  mostrar("loading", "block");
  document.getElementById("btn-buscar").disabled = true;

  try {
    const resp = await fetch(`${API_URL}/parcela?direccion=${encodeURIComponent(dir)}`);
    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.detail || "Error al consultar la API");
    }
    const d = await resp.json();
    datosActuales = d;
    ocultar("loading");
    renderizar(d);
  } catch (e) {
    ocultar("loading");
    document.getElementById("error-text").textContent = e.message;
    mostrar("error-msg", "block");
  } finally {
    document.getElementById("btn-buscar").disabled = false;
  }
}

// ── Renderizado de resultados ─────────────────────────────────────────────
function renderizar(d) {
  // Si el SMP viene vacío, la API de catastro no tiene datos para esa dirección
  if (!d.smp) {
    document.getElementById("error-text").textContent =
      "No se encontraron datos catastrales para esta dirección. Probá con el número de puerta principal del edificio o una dirección cercana.";
    mostrar("error-msg", "block");
    ocultar("loading");
    return;
  }
  // Badge dirección
  document.getElementById("badge-text").textContent =
    `${d.direccion}  ·  SMP ${d.smp}`;
  mostrar("address-badge", "flex");

  // Capacidad constructiva
  const maxM2 = d.superficie_edificable_max_m2;
  const actM2 = d.superficie_edificada_actual_m2;
  const rem   = d.potencial_remanente_m2;

  texto("m-edif-max",  maxM2 != null ? fmt(maxM2) : "—");
  texto("m-remanente", rem   != null ? fmt(rem)   : "—");
  texto("m-altura",    d.altura_maxima_m != null ? fmt(d.altura_maxima_m, 1) : "—");
  texto("m-pisos",     d.pisos_estimados ?? "—");

  // Barra de potencial: solo mostrar si hay FOT y superficie edificable válida
  const maxM2 = d.superficie_edificable_max_m2;
  const actM2 = d.superficie_edificada_actual_m2;
  const rem   = d.potencial_remanente_m2;

  if (maxM2 && actM2 != null && maxM2 > 0) {
      const pct = Math.min(100, Math.round((actM2 / maxM2) * 100));
      document.getElementById("barra-potencial").style.width = pct + "%";
      document.getElementById("label-construido").textContent = `${fmt(actM2)} m² construidos`;
      document.getElementById("label-disponible").textContent =
          rem != null ? `${fmt(rem)} m² disponibles` : "— m² disponibles";
  } else {
      // Sin FOT: ocultar la barra y mostrar mensaje
      document.getElementById("barra-potencial").style.width = "0%";
      document.getElementById("label-construido").textContent = "Sin datos de FOT para calcular potencial";
      document.getElementById("label-disponible").textContent = "";
  }

  // Terreno y normativa
  texto("i-sup",      d.superficie_terreno_m2 != null ? `${fmt(d.superficie_terreno_m2)} m²` : "—");
  texto("i-ff",       d.frente_m && d.fondo_m
    ? `${fmt(d.frente_m, 2)} m · ${fmt(d.fondo_m, 2)} m` : "—");
  texto("i-fot",      d.fot != null ? fmt(d.fot, 2) : "—");
  texto("i-distrito", d.distrito ?? "—");
  texto("i-uso",      d.uso_permitido ?? "—");

  // Badges de restricciones
  const cont = document.getElementById("i-restricciones");
  cont.innerHTML = "";

  const b1 = document.createElement("span");
  b1.className = "badge " + (d.proteccion_patrimonial ? "badge-amber" : "badge-green");
  b1.textContent = d.proteccion_patrimonial ? "Protección patrimonial" : "Sin protección patrimonial";

  const b2 = document.createElement("span");
  b2.className = "badge " + (d.riesgo_hidrico ? "badge-red" : "badge-green");
  b2.textContent = d.riesgo_hidrico ? "Riesgo hídrico" : "Sin riesgo hídrico";

  cont.appendChild(b1);
  cont.appendChild(b2);

  // Identificación
  texto("i-smp",         d.smp ?? "—");
  texto("i-edif-actual", actM2 != null ? `${fmt(actM2)} m²` : "—");
  texto("i-coords",
    d.coordenadas
      ? `${d.coordenadas.lat.toFixed(4)} / ${d.coordenadas.lng.toFixed(4)}`
      : "—");

  // Mapa con tiles de CARTO (sin restricciones de referer)
  const lat = d.coordenadas?.lat;
  const lng = d.coordenadas?.lng;

  if (lat && lng) {
    if (!mapa) {
      mapa = L.map("map", { zoomControl: true }).setView([lat, lng], 17);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution: "© OpenStreetMap · © CARTO",
        subdomains: "abcd",
        maxZoom: 19
      }).addTo(mapa);
    } else {
      mapa.setView([lat, lng], 17);
      if (marcador) mapa.removeLayer(marcador);
    }

    marcador = L.circleMarker([lat, lng], {
      radius: 10,
      fillColor: "#3B6D11",
      color: "#27500A",
      weight: 2,
      fillOpacity: 0.85
    }).addTo(mapa)
      .bindPopup(`<b>${d.direccion}</b><br>SMP: ${d.smp}`)
      .openPopup();
  }

  // Mostrar resultados y corregir tamaño del mapa
  mostrar("results", "grid");
  setTimeout(() => { if (mapa) mapa.invalidateSize(); }, 100);
}

// ── Compartir ─────────────────────────────────────────────────────────────
function compartir() {
  if (!datosActuales) return;
  const dir = encodeURIComponent(document.getElementById("input-dir").value.trim());
  const url = `${window.location.origin}${window.location.pathname}?direccion=${dir}`;
  navigator.clipboard.writeText(url).then(() => {
    const t = document.getElementById("toast");
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2500);
  });
}

// ── Carga desde URL con parámetro ?direccion= ─────────────────────────────
window.addEventListener("load", () => {
  const params = new URLSearchParams(window.location.search);
  const dir = params.get("direccion");
  if (dir) {
    document.getElementById("input-dir").value = dir;
    consultar();
  }
});