const API_URL = "https://tif-urbanistico.onrender.com";

let mapa = null;
let marcador = null;
let datosActuales = null;

// ── Historial de búsquedas ────────────────────────────────────────────────
// Guarda las últimas 5 direcciones consultadas exitosamente en localStorage
// localStorage persiste entre sesiones del navegador sin necesidad de backend
const MAX_HISTORIAL = 5;
const HISTORIAL_KEY = "parcela_caba_historial";

function getHistorial() {
    try {
        return JSON.parse(localStorage.getItem(HISTORIAL_KEY)) || [];
    } catch { return []; }
}

function guardarEnHistorial(valor) {
    // Evita duplicados (case-insensitive) y mantiene el más reciente primero
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
        // Al hacer clic en una sugerencia: llena el input y consulta
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
    // setTimeout de 200ms para que el onclick de la sugerencia se ejecute antes
    setTimeout(() => {
        document.getElementById("sugerencias").style.display = "none";
    }, 200);
}

// ── Eventos del input ─────────────────────────────────────────────────────
document.getElementById("input-dir").addEventListener("keydown", e => {
    if (e.key === "Enter") consultar();
});
// Mostrar historial al hacer foco en el input
document.getElementById("input-dir").addEventListener("focus", mostrarSugerencias);
// Ocultar historial al salir del input
document.getElementById("input-dir").addEventListener("blur", ocultarSugerencias);

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
        // Solo guardamos en historial si la consulta fue exitosa
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
    // Si SMP vacío: la API de catastro no tiene datos para esa dirección
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

    // Tarjeta de capacidad constructiva
    texto("m-edif-max",  maxM2 != null ? fmt(maxM2) : "—");
    if (rem != null && rem < 0) {
      texto("m-remanente", "—");
      document.getElementById("m-remanente").closest(".metric").title =
          "Capacidad constructiva por encima del FOT vigente";
    } else {
        texto("m-remanente", rem != null ? fmt(rem) : "—");
    }
    texto("m-altura",    d.altura_maxima_m != null ? fmt(d.altura_maxima_m, 1) : "—");
    texto("m-pisos",     d.pisos_estimados ?? "—");

    // Barra de potencial: solo si hay FOT y superficie edificable válida
    if (maxM2 && actM2 != null && maxM2 > 0) {
      const pct = Math.min(100, Math.round((actM2 / maxM2) * 100));
      document.getElementById("barra-potencial").style.width = Math.min(100, pct) + "%";

      document.getElementById("label-construido").textContent = `${fmt(actM2)} m² construidos`;

      // Si el remanente es negativo: construido supera el FOT vigente
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

    // Tarjeta de terreno y normativa
    texto("i-sup",      d.superficie_terreno_m2 != null ? `${fmt(d.superficie_terreno_m2)} m²` : "—");
    texto("i-ff",       d.frente_m && d.fondo_m
        ? `${fmt(d.frente_m, 2)} m · ${fmt(d.fondo_m, 2)} m` : "—");
    texto("i-fot",      d.fot != null ? fmt(d.fot, 2) : "—");
    texto("i-distrito", d.distrito ?? "—");
    texto("i-uso",      d.uso_permitido ?? "—");

    // Badges de restricciones con color semántico
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

    // Tarjeta de identificación
    texto("i-smp",         d.smp ? d.smp.toUpperCase() : "—");
    texto("i-edif-actual", actM2 != null ? `${fmt(actM2)} m²` : "—");
    texto("i-coords",      d.coordenadas
        ? `${d.coordenadas.lat.toFixed(4)} / ${d.coordenadas.lng.toFixed(4)}`
        : "—");

    // Mapa Leaflet con tiles de CARTO
    const lat = d.coordenadas?.lat;
    const lng = d.coordenadas?.lng;
    if (lat && lng) {
        if (!mapa) {
            // Primera consulta: inicializar el mapa
            mapa = L.map("map", { zoomControl: true }).setView([lat, lng], 17);
            L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
                attribution: "© OpenStreetMap · © CARTO",
                subdomains: "abcd", maxZoom: 19
            }).addTo(mapa);
        } else {
            // Consultas siguientes: mover el mapa y quitar marcador anterior
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

    // Mostrar resultados y forzar recálculo del tamaño del mapa
    // invalidateSize() necesario porque el mapa estaba oculto al inicializarse
    mostrar("results", "grid");
    setTimeout(() => { if (mapa) mapa.invalidateSize(); }, 100);
}

// ── Descargar ficha PDF ───────────────────────────────────────────────────
// Usa jsPDF (cargado desde CDN en index.html) para generar el PDF en el navegador
// No requiere backend — todo se procesa del lado del cliente
function descargarPDF() {
    if (!datosActuales) return;
    const d = datosActuales;
    const f = (n, dec = 0) => n != null
        ? Number(n).toLocaleString("es-AR", { maximumFractionDigits: dec })
        : "—";

    // Capturamos el mapa como imagen antes de generar el PDF
    const mapaEl = document.getElementById("map");
    const capturarMapa = mapaEl && mapa
        ? html2canvas(mapaEl, { useCORS: true, scale: 1.5 })
        : Promise.resolve(null);

    capturarMapa.then(canvas => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // ── Paleta azul formal ────────────────────────────────────────
        const azul       = [30, 64, 175];    // azul oscuro — header
        const azulClaro  = [219, 234, 254];  // azul muy claro — fondo secciones
        const azulMedio  = [59, 130, 246];   // azul medio — títulos de sección
        const negro      = [15, 23, 42];     // casi negro — valores
        const gris       = [71, 85, 105];    // gris azulado — labels

        // ── Header ────────────────────────────────────────────────────
        doc.setFillColor(...azul);
        doc.rect(0, 0, 210, 24, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(15);
        doc.setFont("helvetica", "bold");
        doc.text("Parcela CABA", 14, 10);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.text("Indicadores Urbanísticos · Caballito · Ciudad Autónoma de Buenos Aires", 14, 17);
        doc.setFontSize(8);
        doc.text(`Generado el ${new Date().toLocaleDateString("es-AR")}`, 155, 10);

        // ── Dirección ─────────────────────────────────────────────────
        doc.setTextColor(...negro);
        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        doc.text(d.direccion || "—", 14, 34);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...gris);
        doc.text(`SMP: ${d.smp ? d.smp.toUpperCase() : "—"}`, 14, 40);

        // Línea separadora
        doc.setDrawColor(...azul);
        doc.setLineWidth(0.8);
        doc.line(14, 44, 196, 44);

        // ── Función para dibujar una sección ──────────────────────────
        function seccion(titulo, filas, yInicio) {
            // Fondo azul claro de la sección
            doc.setFillColor(...azulClaro);
            doc.roundedRect(14, yInicio, 182, 7, 1, 1, "F");

            // Título de la sección
            doc.setFontSize(8);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(...azulMedio);
            doc.text(titulo, 17, yInicio + 5);

            let y = yInicio + 12;
            filas.forEach(([label, val], i) => {
                // Fondo alternado para legibilidad
                if (i % 2 === 0) {
                    doc.setFillColor(241, 245, 249);
                    doc.rect(14, y - 4, 182, 7, "F");
                }
                doc.setFont("helvetica", "normal");
                doc.setTextColor(...gris);
                doc.setFontSize(8);
                doc.text(label, 17, y);
                doc.setFont("helvetica", "bold");
                doc.setTextColor(...negro);
                doc.setFontSize(9);
                doc.text(String(val), 110, y);
                y += 8;
            });
            return y + 4;  // retorna la Y final de la sección
        }

        // ── Sección: capacidad constructiva ───────────────────────────
        const potencial = d.potencial_remanente_m2 != null
            ? (d.potencial_remanente_m2 < 0
                ? "Por encima del FOT vigente"
                : `${f(d.potencial_remanente_m2)} m²`)
            : "—";

        let y = seccion("CAPACIDAD CONSTRUCTIVA", [
            ["Superficie edificable máx.", d.superficie_edificable_max_m2 != null ? `${f(d.superficie_edificable_max_m2)} m²` : "—"],
            ["Potencial remanente",         potencial],
            ["Altura máxima permitida",     d.altura_maxima_m != null ? `${f(d.altura_maxima_m, 1)} m` : "—"],
            ["Pisos estimados",             d.pisos_estimados != null ? `${d.pisos_estimados} pisos` : "—"],
            ["FOT",                         d.fot != null ? f(d.fot, 2) : "—"],
        ], 50);

        // ── Sección: terreno y normativa ──────────────────────────────
        y = seccion("TERRENO Y NORMATIVA", [
            ["Superficie del terreno",  d.superficie_terreno_m2 != null ? `${f(d.superficie_terreno_m2)} m²` : "—"],
            ["Frente / fondo",          d.frente_m && d.fondo_m ? `${f(d.frente_m, 2)} m · ${f(d.fondo_m, 2)} m` : "—"],
            ["Distrito urbanístico",    d.distrito || "—"],
            ["Uso permitido",           d.uso_permitido || "—"],
            ["Protección patrimonial",  d.proteccion_patrimonial ? "Sí" : "No"],
            ["Riesgo hídrico",          d.riesgo_hidrico ? "Sí" : "No"],
        ], y);

        // ── Sección: identificación ───────────────────────────────────
        y = seccion("IDENTIFICACIÓN", [
            ["SMP",          d.smp ? d.smp.toUpperCase() : "—"],
            ["Coordenadas",  d.coordenadas ? `${d.coordenadas.lat.toFixed(6)}, ${d.coordenadas.lng.toFixed(6)}` : "—"],
        ], y);

        // ── Imagen del mapa ───────────────────────────────────────────
        if (canvas) {
            const imgData = canvas.toDataURL("image/jpeg", 0.85);
            const mapY = y + 2;
            const mapH = 55;  // altura del mapa en el PDF

            // Borde azul alrededor del mapa
            doc.setDrawColor(...azul);
            doc.setLineWidth(0.4);
            doc.roundedRect(14, mapY, 182, mapH + 6, 2, 2, "S");

            // Label encima del mapa
            doc.setFillColor(...azulClaro);
            doc.roundedRect(14, mapY, 182, 7, 1, 1, "F");
            doc.setFontSize(8);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(...azulMedio);
            doc.text("UBICACIÓN DE LA PARCELA", 17, mapY + 5);

            // Imagen del mapa
            doc.addImage(imgData, "JPEG", 15, mapY + 8, 180, mapH);
            y = mapY + mapH + 16;
        }

        // ── Footer ────────────────────────────────────────────────────
        const footerY = 275;
        doc.setFillColor(...azulClaro);
        doc.rect(0, footerY, 210, 22, "F");
        doc.setDrawColor(...azul);
        doc.setLineWidth(0.4);
        doc.line(0, footerY, 210, footerY);
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...gris);
        doc.text("Fuentes: Catastro GCBA · Código Urbanístico CABA (31/12/2024) · USIG · OpenStreetMap · CARTO", 14, footerY + 7);
        doc.text("Los datos son orientativos. Verificar con organismos oficiales del GCBA antes de tomar decisiones.", 14, footerY + 13);

        // ── Guardar ───────────────────────────────────────────────────
        const nombre = d.smp
            ? `parcela_${d.smp.replace(/-/g, "_").toUpperCase()}.pdf`
            : "parcela_caba.pdf";
        doc.save(nombre);
    });
}

// ── Compartir resultado ───────────────────────────────────────────────────
// Copia al portapapeles una URL con la dirección como parámetro
// Al abrir esa URL, la página ejecuta la consulta automáticamente
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
// Permite que los links compartidos ejecuten la búsqueda al abrirse
window.addEventListener("load", () => {
    const params = new URLSearchParams(window.location.search);
    const dir = params.get("direccion");
    if (dir) {
        document.getElementById("input-dir").value = dir;
        consultar();
    }
});