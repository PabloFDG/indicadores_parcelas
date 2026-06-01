const API_URL = "https://tif-urbanistico.onrender.com";

let mapa = null;
let marcador = null;
let datosActuales = null;

// ── Historial de búsquedas ────────────────────────────────────────────────
const MAX_HISTORIAL = 5;
const HISTORIAL_KEY = "parcela_caba_historial";

function getHistorial() {
    try {
        return JSON.parse(localStorage.getItem(HISTORIAL_KEY)) || [];
    } catch { return []; }
}

function guardarEnHistorial(valor) {
    let h = getHistorial().filter(x => x.toLowerCase() !== valor.toLowerCase());
    h.unshift(valor);
    if (h.length > MAX_HISTORIAL) h = h.slice(0, MAX_HISTORIAL);
    localStorage.setItem(HISTORIAL_KEY, JSON.stringify(h));
}

function mostrarSugerencias() {
    const input = document.getElementById("input-dir");
    const lista = document.getElementById("sugerencias");
    const h = getHistorial();
    if (!h.length) { lista.style.display = "none"; return; }
    lista.innerHTML = "";
    h.forEach(item => {
        const li = document.createElement("li");
        li.textContent = item;
        li.onclick = () => {
            input.value = item;
            lista.style.display = "none";
            consultar();
        };
        lista.appendChild(li);
    });
    lista.style.display = "block";
}

function ocultarSugerencias() {
    setTimeout(() => {
        document.getElementById("sugerencias").style.display = "none";
    }, 200);
}

// ── Eventos del input ─────────────────────────────────────────────────────
document.getElementById("input-dir").addEventListener("keydown", e => {
    if (e.key === "Enter") consultar();
});
document.getElementById("input-dir").addEventListener("focus", mostrarSugerencias);
document.getElementById("input-dir").addEventListener("blur", ocultarSugerencias);

// ── Glosario ──────────────────────────────────────────────────────────────
function abrirGlosario() {
    document.getElementById("glosario-overlay").classList.add("active");
    document.body.style.overflow = "hidden";
}

function cerrarGlosario(e) {
    if (e && e.target !== document.getElementById("glosario-overlay")) return;
    document.getElementById("glosario-overlay").classList.remove("active");
    document.body.style.overflow = "";
}

document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
        document.getElementById("glosario-overlay").classList.remove("active");
        document.body.style.overflow = "";
    }
});

// ── Utilidades ────────────────────────────────────────────────────────────
function mostrar(id, display = "flex") { document.getElementById(id).style.display = display; }
function ocultar(id) { document.getElementById(id).style.display = "none"; }
function texto(id, val) { document.getElementById(id).textContent = val ?? "—"; }
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
    document.getElementById("sugerencias").style.display = "none";

    try {
        const resp = await fetch(`${API_URL}/parcela?direccion=${encodeURIComponent(dir)}`);
        if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err.detail || "Error al consultar la API");
        }
        const d = await resp.json();
        datosActuales = d;
        guardarEnHistorial(dir);
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
    if (!d.smp) {
        document.getElementById("error-text").textContent =
            "No se encontraron datos catastrales para esta dirección. " +
            "Probá con el número de puerta principal del edificio o una dirección cercana.";
        mostrar("error-msg", "block");
        return;
    }

    // Badge de dirección normalizada
    document.getElementById("badge-text").textContent =
        `${d.direccion}  ·  SMP ${d.smp.toUpperCase()}`;
    mostrar("address-badge", "flex");

    const maxM2 = d.superficie_edificable_max_m2;
    const actM2 = d.superficie_edificada_actual_m2;
    const rem   = d.potencial_remanente_m2;

    // ── Capacidad constructiva ────────────────────────────────────────────
    // Mostrar solo el número sin unidad (la unidad está en el label del título)
    texto("m-edif-max", maxM2 != null ? fmt(maxM2) : "—");

    if (rem != null && rem < 0) {
        texto("m-remanente", "—");
        document.getElementById("m-remanente").closest(".metric").title =
            "Capacidad constructiva por encima del FOT vigente";
    } else {
        texto("m-remanente", rem != null ? fmt(rem) : "—");
    }
    texto("m-altura", d.altura_maxima_m != null ? fmt(d.altura_maxima_m, 1) : "—");
    texto("m-pisos",  d.pisos_estimados != null
        ? `${d.pisos_estimados} ` : "—");
    // Restaurar la unidad "p" en pisos estimados
    if (d.pisos_estimados != null) {
        const el = document.getElementById("m-pisos");
        el.innerHTML = `${d.pisos_estimados} <span class="metric-unit">p</span>`;
    }

    // Barra de potencial
    if (maxM2 && actM2 != null && maxM2 > 0) {
        const pct = Math.min(100, Math.round((actM2 / maxM2) * 100));
        document.getElementById("barra-potencial").style.width = pct + "%";
        document.getElementById("label-construido").textContent = `${fmt(actM2)} m² construidos`;
        if (rem != null && rem < 0) {
            document.getElementById("label-disponible").textContent =
                "Capacidad constructiva por encima del FOT vigente";
        } else {
            document.getElementById("label-disponible").textContent =
                rem != null ? `${fmt(rem)} m² disponibles` : "— m² disponibles";
        }
    } else {
        document.getElementById("barra-potencial").style.width = "0%";
        document.getElementById("label-construido").textContent = "Sin datos de FOT para calcular potencial";
        document.getElementById("label-disponible").textContent = "";
    }

    // ── Terreno y normativa ───────────────────────────────────────────────
    texto("i-ff",
        d.frente_m && d.fondo_m
            ? `${fmt(d.frente_m, 2)} m · ${fmt(d.fondo_m, 2)} m`
            : "—");
    texto("i-sup",         d.superficie_terreno_m2 != null ? `${fmt(d.superficie_terreno_m2)} m²` : "—");
    texto("i-edif-actual", actM2 != null ? `${fmt(actM2)} m²` : "—");
    texto("i-uf",          d.unidades_funcionales != null ? d.unidades_funcionales : "—");
    texto("i-pisos-sr",    d.pisos_sobre_rasante  != null ? `${d.pisos_sobre_rasante}` : "—");
    texto("i-pisos-br",    d.pisos_bajo_rasante   != null ? `${d.pisos_bajo_rasante}`  : "—");
    texto("i-fot",         d.fot != null ? fmt(d.fot, 2) : "—");
    texto("i-distrito",    d.distrito ?? "—");
    texto("i-uso",         d.uso_permitido ?? "—");

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

    // ── Identificación ────────────────────────────────────────────────────
    texto("i-smp",    d.smp ? d.smp.toUpperCase() : "—");
    texto("i-coords", d.coordenadas
        ? `${d.coordenadas.lat.toFixed(4)} / ${d.coordenadas.lng.toFixed(4)}`
        : "—");
    texto("i-barrio", d.barrio ?? "—");
    texto("i-comuna", d.comuna ? `Comuna ${d.comuna}` : "—");

    // ── Mapa Leaflet ──────────────────────────────────────────────────────
    const lat = d.coordenadas?.lat;
    const lng = d.coordenadas?.lng;
    if (lat && lng) {
        if (!mapa) {
            mapa = L.map("map", { zoomControl: true }).setView([lat, lng], 17);
            L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
                attribution: "© OpenStreetMap · © CARTO",
                subdomains: "abcd", maxZoom: 19
            }).addTo(mapa);
        } else {
            mapa.setView([lat, lng], 17);
            if (marcador) mapa.removeLayer(marcador);
        }
        marcador = L.circleMarker([lat, lng], {
            radius: 10, fillColor: "#3B6D11", color: "#27500A",
            weight: 2, fillOpacity: 0.85
        }).addTo(mapa)
            .bindPopup(`<b>${d.direccion}</b><br>SMP: ${d.smp.toUpperCase()}`)
            .openPopup();
    }

    mostrar("results", "grid");
    setTimeout(() => { if (mapa) mapa.invalidateSize(); }, 100);
}

// ── Descargar ficha PDF ───────────────────────────────────────────────────
function descargarPDF() {
    if (!datosActuales) return;
    const d = datosActuales;
    const f = (n, dec = 0) => n != null
        ? Number(n).toLocaleString("es-AR", { maximumFractionDigits: dec })
        : "—";

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // ── Paleta ────────────────────────────────────────────────────────────
    const azulPizarra = [51, 65, 85];
    const teal        = [8, 145, 178];
    const tealClaro   = [224, 242, 254];
    const negro       = [30, 41, 59];
    const gris        = [100, 116, 139];
    const grisClaro   = [248, 250, 252];
    const footerBg    = [241, 245, 249];
    const borde       = [226, 232, 240];

    // ── Header ────────────────────────────────────────────────────────────
    doc.setFillColor(...azulPizarra);
    doc.rect(0, 0, 210, 22, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Parcela CABA — Indicadores Urbanísticos", 14, 10);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(148, 163, 184);
    doc.text("Caballito · Ciudad Autónoma de Buenos Aires", 14, 17);
    doc.text(`Generado el ${new Date().toLocaleDateString("es-AR")}`, 160, 17);

    // ── Dirección + SMP + barrio/comuna ──────────────────────────────────
    doc.setTextColor(...negro);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(d.direccion || "—", 14, 34);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...gris);
    const subtitulo = [
        d.smp    ? `SMP: ${d.smp.toUpperCase()}` : null,
        d.barrio ? d.barrio                       : null,
        d.comuna ? `Comuna ${d.comuna}`           : null
    ].filter(Boolean).join("  ·  ");
    doc.text(subtitulo || "—", 14, 41);

    doc.setDrawColor(...azulPizarra);
    doc.setLineWidth(0.8);
    doc.line(14, 45, 196, 45);

    // ── Función para dibujar sección ──────────────────────────────────────
    function seccion(titulo, filas, yInicio) {
        doc.setFillColor(...tealClaro);
        doc.rect(14, yInicio, 182, 8, "F");
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...teal);
        doc.text(titulo, 17, yInicio + 5.5);

        let y = yInicio + 13;
        filas.forEach(([label, val], i) => {
            if (i % 2 === 0) {
                doc.setFillColor(...grisClaro);
                doc.rect(14, y - 4.5, 182, 8, "F");
            }
            doc.setFont("helvetica", "normal");
            doc.setTextColor(...gris);
            doc.setFontSize(8.5);
            doc.text(label, 17, y);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(...negro);
            doc.setFontSize(9);
            doc.text(String(val), 193, y, { align: "right" });
            y += 8.5;
        });
        doc.setDrawColor(...borde);
        doc.setLineWidth(0.3);
        doc.line(14, y, 196, y);
        return y + 6;
    }

    // Potencial remanente (texto especial si negativo)
    const potencial = d.potencial_remanente_m2 != null
        ? (d.potencial_remanente_m2 < 0
            ? "Por encima del FOT vigente"
            : `${f(d.potencial_remanente_m2)} m²`)
        : "—";

    // ── Sección 1: capacidad constructiva ─────────────────────────────────
    let y = seccion("CAPACIDAD CONSTRUCTIVA", [
        ["Superficie edificable máx. en m²", d.superficie_edificable_max_m2 != null ? `${f(d.superficie_edificable_max_m2)} m²` : "—"],
        ["Potencial remanente en m²",         potencial],
        ["Altura máxima permitida en m",      d.altura_maxima_m  != null ? `${f(d.altura_maxima_m, 1)} m` : "—"],
        ["Pisos estimados",                   d.pisos_estimados  != null ? String(d.pisos_estimados)      : "—"],
        ["FOT",                               d.fot              != null ? f(d.fot, 2)                    : "—"],
    ], 52);

    // ── Sección 2: terreno y normativa ────────────────────────────────────
    y = seccion("TERRENO Y NORMATIVA", [
        ["Frente / fondo",                   d.frente_m && d.fondo_m
            ? `${f(d.frente_m, 2)} m · ${f(d.fondo_m, 2)} m` : "—"],
        ["Superficie del terreno",           d.superficie_terreno_m2          != null ? `${f(d.superficie_terreno_m2)} m²`          : "—"],
        ["Superficie edificada actualmente", d.superficie_edificada_actual_m2 != null ? `${f(d.superficie_edificada_actual_m2)} m²` : "—"],
        ["Unidades funcionales",             d.unidades_funcionales           != null ? String(d.unidades_funcionales)               : "—"],
        ["Pisos sobre rasante",              d.pisos_sobre_rasante            != null ? String(d.pisos_sobre_rasante)                : "—"],
        ["Pisos bajo rasante",               d.pisos_bajo_rasante             != null ? String(d.pisos_bajo_rasante)                 : "—"],
        ["Distrito urbanístico",             d.distrito       || "—"],
        ["Uso permitido",                    d.uso_permitido  || "—"],
        ["Protección patrimonial",           d.proteccion_patrimonial ? "Sí" : "No"],
        ["Riesgo hídrico",                   d.riesgo_hidrico         ? "Sí" : "No"],
    ], y);

    // ── Sección 3: identificación ─────────────────────────────────────────
    y = seccion("IDENTIFICACIÓN", [
        ["SMP",         d.smp    ? d.smp.toUpperCase()  : "—"],
        ["Barrio",      d.barrio ? d.barrio              : "—"],
        ["Comuna",      d.comuna ? `Comuna ${d.comuna}`  : "—"],
        ["Coordenadas", d.coordenadas
            ? `${d.coordenadas.lat.toFixed(6)}, ${d.coordenadas.lng.toFixed(6)}`
            : "—"],
    ], y);

    // ── Footer ────────────────────────────────────────────────────────────
    const footerY = 275;
    doc.setFillColor(...footerBg);
    doc.rect(0, footerY, 210, 22, "F");
    doc.setDrawColor(...azulPizarra);
    doc.setLineWidth(0.5);
    doc.line(0, footerY, 210, footerY);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...gris);
    doc.text("Fuentes: Catastro GCBA · Código Urbanístico CABA (31/12/2024) · USIG", 14, footerY + 7);
    doc.setTextColor(148, 163, 184);
    doc.text("Los datos son orientativos. Verificar con organismos oficiales del GCBA.", 14, footerY + 13);

    const nombre = d.smp
        ? `parcela_${d.smp.replace(/-/g, "_").toUpperCase()}.pdf`
        : "parcela_caba.pdf";
    doc.save(nombre);
}

// ── Ver en Realidad Aumentada ─────────────────────────────────────────────
function abrirAR() {
    if (!datosActuales) return;
    const d = datosActuales;
    const ladoAprox = Math.sqrt(d.superficie_terreno_m2 || 100);
    const datos = {
        altura_maxima_m:       d.altura_maxima_m       || 15,
        superficie_terreno_m2: d.superficie_terreno_m2 || 100,
        frente_m:              d.frente_m              || ladoAprox,
        fondo_m:               d.fondo_m               || ladoAprox,
        fot:                   d.fot                   || null,
        direccion:             d.direccion             || "—"
    };
    sessionStorage.setItem("parcela_ar", JSON.stringify(datos));
    window.open("ar_view.html", "_blank");
}

// ── Compartir resultado ───────────────────────────────────────────────────
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

// ── Carga automática desde URL con ?direccion= ────────────────────────────
window.addEventListener("load", () => {
    const params = new URLSearchParams(window.location.search);
    const dir = params.get("direccion");
    if (dir) {
        document.getElementById("input-dir").value = dir;
        consultar();
    }
});
