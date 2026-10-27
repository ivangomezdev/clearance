# Clearance Radar

Dashboard en español conectado a las ofertas públicas de Hidden Clearances. Proyecto Vinext/React desplegable en Cloudflare Workers mediante Sites.

## Ejecutar

### Vercel / Next.js

El repositorio incluye `vercel.json` con el preset `nextjs`, instalación mediante `npm ci`, build `npm run build:vercel` y salida `.next`. Importa la raíz del repositorio en Vercel. El dashboard usa únicamente una API pública y no necesita variables de entorno para estas rutas.

- `npm run dev:vercel`: desarrollo con Next.js.
- `npm run build:vercel`: genera el build de Next.js y `.next/routes-manifest.json` que necesita Vercel.
- `npm run start:vercel`: prueba local del build de producción.

El script `npm run build` conserva el build de Vinext/Cloudflare usado por Sites y genera `dist/`; no es el build de Vercel. La configuración versionada selecciona explícitamente el comando correcto para Vercel. El acceso privado mediante ChatGPT corresponde al alojamiento Sites; Vercel aplica los controles de acceso configurados en tu proyecto de Vercel.

### Sites / Cloudflare

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

## Fuente Discord (Profit Central)

La fuente está implementada, pero no se han leído ni publicado mensajes reales de Profit Central: requiere un bot que un administrador haya instalado en ese servidor, con acceso a los canales seleccionados. La invitación por sí sola solo permite consultar metadatos del servidor. Servidor verificado mediante la invitación: `1513992592801398814`.

### Configuración del bot y del alojamiento

1. Crear una aplicación/bot desde el [Developer Portal de Discord](https://discord.com/developers/applications), o usar un bot autorizado existente. No usar tokens de cuentas personales.
2. Habilitar **Message Content Intent** en el bot (y obtener aprobación de Discord cuando corresponda). Un administrador del servidor debe instalarlo y permitir **View Channel** y **Read Message History** en los canales de ofertas. No necesita permisos de escritura ni Administrator.
3. En Vercel → Project → Settings → Environment Variables (o variables de ejecución de Sites), configurar:

| Variable del servidor | Valor |
| --- | --- |
| `DISCORD_BOT_TOKEN` | Token del bot, sin el prefijo `Bot `. Nunca se envía al navegador. |
| `DISCORD_GUILD_ID` | `1513992592801398814` para Profit Central. |
| `DISCORD_CHANNEL_IDS` | IDs de los canales de ofertas autorizados, separados por comas. Hasta 20. Se obtienen con Developer Mode → Copy Channel ID. Incluir IDs de hilos si se van a consultar hilos. |
| `DISCORD_DASHBOARD_KEY` | Clave aleatoria de al menos 32 caracteres para el acceso a esta fuente en el dashboard. Distinta del token del bot. |

4. Desplegar de nuevo. Para desarrollo, usar `.env.local` (ignorado por Git); no usar variables `NEXT_PUBLIC_` para ninguno de estos valores.
5. En el dashboard, abrir **Discord**, introducir solamente la clave `DISCORD_DASHBOARD_KEY` y pulsar **Conectar y cargar**. Se consultan todos los canales configurados o el canal elegido. **Cargar mensajes anteriores** continúa desde el cursor `before` de cada canal.

### Qué importa y cómo protege el acceso

- Usa `POST /api/discord`, que hace lecturas de la API oficial v10 con autenticación de bot. Valida la clave de acceso, una lista fija de canales y que cada canal pertenezca al servidor configurado; no acepta destinos arbitrarios. Las respuestas tienen `private, no-store`.
- Canales de texto, anuncios e hilos explícitamente configurados. Los foros/categorías no se recorren automáticamente: se deben configurar los IDs de sus hilos.
- Hasta 100 mensajes por canal y solicitud. Se conserva el cursor del último mensaje revisado aunque no contenga una oferta. Ante HTTP 429 se muestra el tiempo de espera de Discord y se desactiva la carga durante ese plazo.
- Extrae enlaces HTTPS externos desde contenido y embeds de los canales de ofertas, deduplica enlaces repetidos y conserva imagen, descripción, canal y enlace al mensaje original. Una publicación con varios enlaces puede producir varias tarjetas. Es una extracción de enlaces de canales seleccionados, no una clasificación infalible de ofertas.
- No guarda autores, avatares, emails ni la respuesta cruda completa. Las menciones a usuarios/roles se sustituyen por texto neutro. El token nunca se devuelve en respuestas ni se guarda en el código.
- No infiere precios, moneda ni vigencia de mensajes sin un formato validado. Las tarjetas muestran **Consultar precio** y se excluyen de los conteos de ofertas verificadas. El enlace de compra procede del mensaje, no del resolvedor de Hidden Clearances.
- La clave y los datos recibidos solo viven en memoria de la pestaña. **Olvidar acceso y datos** los retira de la sesión. Los favoritos guardan únicamente IDs. La exportación JSON es manual y señala que los mensajes de Discord son una carga parcial independiente.
- La actualización de Discord es manual; el interruptor global de cinco minutos corresponde a Hidden Clearances. No se ejecuta un scraper ni un proceso permanente cuando la web está cerrada. No existe todavía una base de datos histórica de mensajes.
- Los miembros sin capacidad de instalar un bot necesitan que un administrador lo autorice, o proporcionar una exportación que puedan compartir. Un webhook entrante no permite leer el historial de canales.

Referencias: [Get Channel Messages](https://docs.discord.com/developers/resources/message#get-channel-messages), [Message Content Intent](https://docs.discord.com/developers/events/gateway#message-content-intent).

Validación de normalización: `node --experimental-strip-types --test tests/deals.test.mjs tests/discord.test.mjs`.
