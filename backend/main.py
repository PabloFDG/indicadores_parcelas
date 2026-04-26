from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import requests
import math

app = FastAPI(
    title="API Indicadores Urbanísticos — Caballito",
    description="Consulta de capacidad constructiva de parcelas en CABA",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Carga del CSV al arrancar el servidor ────────────────────────────────
print("Cargando datos del Código Urbanístico...")
cu = pd.read_csv("data/codigo_urbanistico_completo.csv", low_memory=False)
cu["smp"] = cu["smp"].str.strip().str.lower()
print(f"✅ {len(cu)} registros cargados")

# ── Mapeo de códigos numéricos a texto legible ───────────────────────────
USOS = {
    1: "Residencial",
    2: "Residencial mixto",
    3: "Central",
    4: "Equipamiento",
    5: "Industrial",
    6: "Urbanizaciones especiales",
}


# ── Funciones auxiliares ─────────────────────────────────────────────────

def limpiar_nan(valor):
    """Convierte nan de pandas a None para que JSON lo acepte como null."""
    if valor is None:
        return None
    if isinstance(valor, float) and math.isnan(valor):
        return None
    return valor


def normalizar_direccion(direccion: str) -> dict:
    """
    Llama a la API de USIG para convertir una dirección en texto
    a coordenadas (lat/lng) y código de calle interno.
    """
    url = "https://servicios.usig.buenosaires.gob.ar/normalizar/"
    resp = requests.get(
        url,
        params={"direccion": direccion, "geocodificar": "true"},
        timeout=10
    )
    resp.raise_for_status()
    data = resp.json()
    resultados = [r for r in data["direccionesNormalizadas"] if r["cod_partido"] == "caba"]
    if not resultados:
        raise ValueError("Dirección no encontrada en CABA")
    r = resultados[0]
    return {
        "direccion_normalizada": r["direccion"],
        "lat":          float(r["coordenadas"]["y"]),
        "lng":          float(r["coordenadas"]["x"]),
        "codigo_calle": r["cod_calle"],
        "altura":       r["altura"]
    }


def get_catastro(codigo_calle: int, altura: int) -> dict:
    """
    Llama a la API de catastro de EPOK para obtener los datos
    de la parcela: SMP, superficie, frente, fondo, pisos existentes.
    """
    url = "https://epok.buenosaires.gob.ar/catastro/parcela/"
    resp = requests.get(
        url,
        params={"codigo_calle": codigo_calle, "altura": altura},
        timeout=10
    )
    resp.raise_for_status()
    return resp.json()


def get_indicadores_cu(smp: str) -> dict:
    """
    Busca el SMP en el CSV del Código Urbanístico cargado en memoria
    y devuelve los indicadores urbanísticos correspondientes.
    """
    smp_norm = smp.strip().lower()
    fila = cu[cu["smp"] == smp_norm]
    if fila.empty:
        return {}
    r = fila.iloc[0]

    # Altura: intentamos uni_edif_1 primero, si es null usamos uni_edif_2
    altura = limpiar_nan(r.get("uni_edif_1"))
    if altura is None:
        altura = limpiar_nan(r.get("uni_edif_2"))

    # Uso del suelo: convertimos código numérico a texto legible
    uso_codigo = limpiar_nan(r.get("uso_1"))
    uso_texto = USOS.get(int(uso_codigo), f"Código {uso_codigo}") if uso_codigo else None

    return {
        "distrito":               limpiar_nan(r.get("dist_1_esp")),
        "altura_maxima_m":        altura,
        "fot":                    limpiar_nan(r.get("fot_em_1")),
        "uso_permitido":          uso_texto,
        "riesgo_hidrico":         bool(r.get("rh", 0)),
        "proteccion_patrimonial": bool(r.get("catalogado", 0)),
    }


# ── Endpoints ────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"mensaje": "API de indicadores urbanísticos — Caballito, CABA"}


@app.get("/parcela")
def consultar_parcela(
    direccion: str = Query(..., description="Dirección en CABA. Ej: Rivadavia 5000")
):
    """
    Endpoint principal. Recibe una dirección, la normaliza,
    consulta catastro y cruza con el Código Urbanístico.
    Devuelve todos los indicadores de capacidad constructiva.
    """

    # Paso 1: normalizar dirección → coordenadas + cod_calle
    try:
        geo = normalizar_direccion(direccion)
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"No se pudo normalizar la dirección: {str(e)}"
        )

    # Paso 2: datos catastrales → SMP, superficie, frente, fondo
    try:
        cat = get_catastro(geo["codigo_calle"], geo["altura"])
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Error consultando catastro: {str(e)}"
        )

    # Paso 3: indicadores urbanísticos del CSV local → FOT, altura, uso
    smp = cat.get("smp", "")
    cu_data = get_indicadores_cu(smp)

    # Paso 4: cálculos derivados
    sup_terreno   = float(cat.get("superficie_total") or 0)
    fot           = float(cu_data.get("fot") or 0)
    altura_max    = float(cu_data.get("altura_maxima_m") or 0)
    sup_edificada = float(cat.get("superficie_cubierta") or 0)

    # Superficie edificable máxima = superficie del terreno × FOT
    sup_edificable_max = round(sup_terreno * fot, 1) if fot and sup_terreno else None

    # Potencial remanente = lo que se puede construir menos lo ya construido
    potencial_remanente = round(sup_edificable_max - sup_edificada, 1) if sup_edificable_max else None

    # Pisos estimados = altura máxima / 3 metros por piso (solo si hay altura)
    pisos_estimados = int(altura_max / 3) if altura_max > 0 else None

    return {
        # ── Identificación ──────────────────────────────────────────────
        "direccion":    geo["direccion_normalizada"],
        "smp":          smp,
        "coordenadas":  {"lat": geo["lat"], "lng": geo["lng"]},

        # ── Datos del terreno (fuente: API Catastro GCBA) ────────────────
        "superficie_terreno_m2":          limpiar_nan(sup_terreno),
        "frente_m":                       limpiar_nan(float(cat.get("frente") or 0)),
        "fondo_m":                        limpiar_nan(float(cat.get("fondo") or 0)),

        # ── Normativa urbanística (fuente: CSV Código Urbanístico GCBA) ──
        "distrito":                       cu_data.get("distrito"),
        "altura_maxima_m":                limpiar_nan(altura_max) if altura_max > 0 else None,
        "pisos_estimados":                pisos_estimados,
        "fot":                            limpiar_nan(fot) if fot > 0 else None,

        # ── Capacidad constructiva (calculado) ───────────────────────────
        "superficie_edificable_max_m2":   sup_edificable_max,
        "superficie_edificada_actual_m2": limpiar_nan(sup_edificada),
        "potencial_remanente_m2":         potencial_remanente,

        # ── Usos y restricciones (fuente: CSV Código Urbanístico GCBA) ───
        "uso_permitido":                  cu_data.get("uso_permitido"),
        "proteccion_patrimonial":         cu_data.get("proteccion_patrimonial"),
        "riesgo_hidrico":                 cu_data.get("riesgo_hidrico"),
    }