# Clearance Radar

Dashboard en español conectado a las ofertas públicas de Hidden Clearances. Proyecto Vinext/React desplegable en Cloudflare Workers mediante Sites.

## Ejecutar

- `npm ci`
- `npm run dev`
- `npx tsc --noEmit`
- `node --experimental-strip-types --test tests/deals.test.mjs`
- `npm run build`

## Flujo verificado el 27 de octubre de 2026

1. `https://www.hiddenclearances.com/deals` carga un cliente Next.js. Sus módulos `useInfiniteDeals` y `clearanceGet` consultan `https://api.hiddenclearances.com/api/v1/deals` sin autenticación (`skipAuth: true`).
2. La respuesta es `{success, data: Deal[], pagination: {page, limit, total, totalPages}}`. El límite máximo observado es 50, incluso al solicitar 100. Sin `activeOnly=false`, la API entrega solo ofertas activas. Se observaron unas 1.750 activas y más de 13.500 incluyendo historial; estos valores cambian.
3. El cliente original admite `retailer`, `type`, `category`, `search`, `sort`, `activeOnly`, `postedWithinHours` y `tag`. Este dashboard recupera páginas completas y filtra localmente el conjunto recibido.
4. Rutas públicas adicionales observadas: `/api/v1/deals/retailers`, `/api/v1/deal-tags` y `/api/v1/feed`. El feed devolvió un conjunto distinto y limitado (400 elementos en la prueba); por ello el catálogo usa `/deals`. No se agregan datos de áreas privadas, premium o inventarios que exijan sesión.
5. La ficha de producto original trae su información inicial en HTML/React Server Components. Al montar el detalle, `fetchDealRedirectUrl(id)` precarga `GET /api/v1/deals/{id}/redirect-url` sin autenticación. Devuelve `{success:true,data:{redirectUrl,affiliateProvider}}`. El botón `Get Deal` abre esa URL en otra pestaña; el cliente original dispone del fallback `/go/{id}` y envía un evento de clic. Este dashboard resuelve el enlace y conserva los parámetros afiliados originales; no añade eventos de tracking.
6. Ejemplo comprobado: teclado Glorious de USD 350 a USD 64, ID `d0d23738-096c-4f3a-84e3-d21443fd81a9`. `dealLink` era un enlace de Amazon, pero el destino real del CTA fue `https://secretclearances.com/go/b0dfww?tag=secretdeal05a-20`, con `affiliateProvider: amazon_go`. Al abrir el CTA original se llegó a Amazon. Por eso no se sustituye `redirectUrl` por `dealLink`.

## Comportamiento

- Carga todas las páginas del alcance seleccionado, con peticiones secuenciales separadas por al menos 1,25 segundos, y elimina duplicados por ID.
- Por defecto carga activas; **Incluir historial** vuelve a cargar también las inactivas/vencidas. Los contadores y filtros corresponden al conjunto recibido.
- Los resultados se presentan en páginas de 24 tarjetas, sin limitar el conjunto de datos descargado.
- La carga puede detenerse. Un fallo conserva datos parciales y muestra el error; no se simulan productos ni se presentan datos parciales como completos.
- Actualización opcional cada cinco minutos mientras la pestaña está visible. No hay sincronización en segundo plano con la app cerrada.
- Búsqueda, tiendas, descuento, estado, etiquetas, precio, orden, cuadrícula/lista y exportación JSON.
- Favoritos guardados en localStorage. Se muestran solo los que están presentes en el catálogo cargado; activar historial permite encontrar favoritos vencidos.
- Detalle con texto, precios USD, fechas en America/Cancun, cupones copiables, respuesta JSON y resolución real de Get Deal.
- Actividad de API muestra las últimas 600 peticiones de la sesión y la última respuesta de catálogo. No inspecciona la red de otras pestañas.

## Servidor

`/api/deals` y `/api/redirect` son proxies de lectura con rutas fijas, validación de parámetros, timeout de 20 segundos y caché privada de 30 segundos. No requieren ni copian cookies o tokens del navegador. El servidor evita depender del CORS del servicio externo; solo acepta los parámetros necesarios y no permite destinos arbitrarios.

## Límites

La paginación por número no es una instantánea atómica: ofertas añadidas o eliminadas mientras se carga pueden causar diferencias entre elementos únicos y total reportado. La interfaz indica ambos. Se respeta cualquier respuesta de error o limitación de la API, incluidos 401/403/429. Ante 429 se conserva el avance, se espera al menos 65 segundos o Retry-After (lo que sea mayor) y se reintenta la misma página hasta tres veces antes de mostrar error. El servicio externo puede cambiar sus rutas, esquema o disponibilidad. Las imágenes se cargan desde las URLs que devuelve el origen. El precio y disponibilidad definitivos se comprueban en la tienda. No hay base de datos ni copia persistente del catálogo.


### Límite de paginación histórica verificado

Aunque la respuesta anuncia 271 páginas y 13.513 registros, al solicitar las páginas 201 o 271 el servicio devuelve `pagination.page: 200` y los mismos 50 IDs de la página 200. La carga histórica observada alcanzó 10.000 IDs únicos. El dashboard comprueba que la página recibida coincide con la solicitada, detiene la carga si el servidor la limita y muestra el motivo, conservando los productos. No presenta ese historial como completo. El catálogo activo (36 páginas / 1.754 registros durante la prueba) sí se cargó completo. Los totales varían con el tiempo.

Sitio privado publicado: https://clearance-radar-leoda.vocal-aphid-2607.chatgpt.site
