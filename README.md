# Parcela CABA — Indicadores Urbanísticos

Consulta de capacidad constructiva de parcelas en el barrio de Caballito, Ciudad Autónoma de Buenos Aires.

Ingresás una dirección y la app devuelve los indicadores urbanísticos de esa parcela: superficie edificable, altura máxima, FOT, uso permitido, restricciones patrimoniales e hídricas, y datos del edificio existente.

🔗 **Demo:** [parcelas-caba.netlify.app](https://parcelas-caba.netlify.app)

---

## ¿Qué hace?

- Normaliza la dirección ingresada usando la API de USIG (GCBA)
- Consulta los datos catastrales de la parcela vía la API de EPOK (GCBA)
- Cruza esos datos con el Código Urbanístico de CABA (CSV, vigente al 31/12/2024)
- Calcula la capacidad constructiva: superficie edificable máxima, potencial remanente y pisos estimados
- Muestra la ubicación de la parcela en un mapa interactivo (Leaflet + CARTO)
- Permite descargar una ficha PDF con todos los indicadores
- Incluye un visualizador volumétrico en Realidad Aumentada (WebXR, solo Android con ARCore)
- Incluye un glosario de términos urbanísticos

---

## Stack tecnológico

| Capa       | Tecnología                                      |
|------------|-------------------------------------------------|
| Frontend   | HTML · CSS · JavaScript vanilla · Leaflet.js   |
| Backend    | Python · FastAPI · Polars                       |
| Deploy     | Netlify (frontend) · Render (backend)           |
| APIs       | USIG GCBA · EPOK Catastro GCBA                 |
| Datos      | Código Urbanístico CABA (CSV — GCBA open data) |

---

## Estructura del repositorio

```
tif-urbanistico/
├── backend/
│   ├── main.py                          # API FastAPI
│   └── data/
│       └── codigo_urbanistico_completo.csv   
├── frontend/
│   ├── index.html                       # Interfaz principal
│   ├── ar_view.html                     # Visualizador AR
│   ├── css/
│   │   └── styles.css
│   └── js/
│       └── app.js
└── README.md
```


---

## Instalación y uso local

### Backend

```bash
cd backend
pip install fastapi uvicorn polars requests
uvicorn main:app --reload
```

La API queda disponible en `http://localhost:8000`.  
Documentación automática: `http://localhost:8000/docs`

### Frontend

Abrí `frontend/index.html` directamente en el navegador, o servilo con cualquier servidor estático:

```bash
cd frontend
npx serve .
```

Por defecto el frontend apunta a la API desplegada en Render. Para apuntar a tu instancia local, cambiá en `app.js`:

```javascript
const API_URL = "http://localhost:8000";
```

---

## Endpoints de la API

| Método | Endpoint    | Descripción                                              |
|--------|-------------|----------------------------------------------------------|
| GET    | `/`         | Estado de la API                                         |
| GET    | `/parcela`  | Consulta por dirección. Parámetro: `?direccion=Rivadavia 5000` |

**Ejemplo de respuesta:**

```json
{
  "direccion": "RIVADAVIA 5000, CABA",
  "smp": "042-041-005",
  "barrio": "CABALLITO",
  "comuna": "6",
  "superficie_terreno_m2": 532,
  "frente_m": 21.64,
  "fondo_m": 24.59,
  "distrito": "R2b",
  "altura_maxima_m": 31.2,
  "pisos_estimados": 10,
  "fot": 4.87,
  "superficie_edificable_max_m2": 2591,
  "superficie_edificada_actual_m2": 0,
  "potencial_remanente_m2": 2591,
  "uso_permitido": "Residencial mixto",
  "proteccion_patrimonial": false,
  "riesgo_hidrico": false,
  "pisos_sobre_rasante": null,
  "pisos_bajo_rasante": null,
  "unidades_funcionales": null
}
```

---

## Fuentes de datos

- **Catastro GCBA** — API de EPOK: datos de la parcela (SMP, superficie, frente, fondo, pisos, unidades funcionales)
- **Código Urbanístico CABA** — Portal de datos abiertos del GCBA, vigente al 31/12/2024: FOT, altura máxima, uso, restricciones
- **USIG GCBA** — Normalización de direcciones y geocodificación
- **OpenStreetMap + CARTO** — Tiles del mapa base

---

## Limitaciones

- Los datos del Código Urbanístico corresponden al corte del 31/12/2024 y pueden no reflejar modificaciones posteriores.
- La superficie edificada y los datos del edificio existente provienen del catastro del GCBA y pueden diferir de la realidad si hay obras sin declarar.
- El visualizador de Realidad Aumentada requiere Android con ARCore y Chrome. 
- La app está acotada al barrio de Caballito, aunque la API responde para cualquier dirección de CABA.

---

## Autor

**Pablo Fernández Del Genio**  · 2026

---

## Licencia

Uso académico. Los datos utilizados son de acceso público y provistos por el Gobierno de la Ciudad de Buenos Aires bajo licencia abierta.
