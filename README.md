# Clearance Radar

Dashboard en español conectado a las ofertas públicas de Hidden Clearances. Proyecto Vinext/React desplegable en Cloudflare Workers mediante Sites.

## Ejecutar

Las cuentas propias usan Supabase Auth y PostgreSQL, con páginas `/login`, `/registro` y `/cuenta`. Sigue [la configuración de cuentas en Vercel](docs/accounts-setup.md): ejecutar el SQL, añadir dos variables y configurar el retorno de confirmación por email. Sin esa configuración, el acceso queda desactivado y no se simulan usuarios ni planes.

### Vercel / Next.js

La instalación canónica es `https://clearance-two.vercel.app`, donde se mantiene el inventario compartido con renovación automática al consultar. `clearance-4gma.vercel.app` redirige a ella conservando la ruta y los parámetros; esa segunda instalación no tenía los secretos de inventario. La regla se limita al dominio alternativo y no redirige la instalación principal ni los previews. Así ambas direcciones públicas utilizan una sola conexión renovable, en lugar de mantener copias independientes de los tokens.

El repositorio incluye `vercel.json` con el preset `nextjs`, instalación mediante `npm ci`, build `npm run build:vercel` y salida `.next`. Importa la raíz del repositorio en Vercel. El dashboard funciona con la API pública sin variables obligatorias. La sesión opcional de Hidden Clearances y Discord usan secretos del servidor descritos más abajo.

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
4. Rutas públicas adicionales observadas: `/api/v1/deals/retailers`, `/api/v1/deal-tags` y `/api/v1/feed`. El feed devolvió un conjunto distinto y limitado (400 elementos en la prueba); el catálogo principal usa `/deals` y se complementa con entradas `in_store` desbloqueadas del feed. No se agregan datos de áreas privadas, premium o inventarios que exijan sesión.
5. La ficha de producto original trae su información inicial en HTML/React Server Components. Al montar el detalle, `fetchDealRedirectUrl(id)` precarga `GET /api/v1/deals/{id}/redirect-url` sin autenticación. Devuelve `{success:true,data:{redirectUrl,affiliateProvider}}`. El botón `Get Deal` abre esa URL en otra pestaña; el cliente original dispone del fallback `/go/{id}` y envía un evento de clic. Este dashboard resuelve el enlace y conserva los parámetros afiliados originales; no añade eventos de tracking.
6. Ejemplo comprobado: teclado Glorious de USD 350 a USD 64, ID `d0d23738-096c-4f3a-84e3-d21443fd81a9`. `dealLink` era un enlace de Amazon, pero el destino real del CTA fue `https://secretclearances.com/go/b0dfww?tag=secretdeal05a-20`, con `affiliateProvider: amazon_go`. Al abrir el CTA original se llegó a Amazon. Por eso no se sustituye `redirectUrl` por `dealLink`.

## Comportamiento

- La carga inicial muestra el logo animado y «Cargando las mejores ofertas» durante al menos cuatro segundos. Las ofertas se descargan en paralelo a esa espera; al cumplirse el plazo y recibirse la primera página, el catálogo queda disponible y el resto continúa cargando. Un error inicial permite reintentar después del plazo mínimo. La identidad visual utiliza el amarillo #F4D500, tomado de la etiqueta de referencia.
- El código postal se recuerda al enviarlo, incluso si falla el inventario. Las consultas exitosas por producto y ZIP se conservan durante cinco minutos en la pestaña, con fecha visible y actualización manual; el producto abierto se recupera al regresar o recargar durante treinta minutos. Los enlaces de tiendas abren otra pestaña. Los datos de inventario no se presentan como nuevos después de vencer el caché.
- El inventario usa el SKU recibido o el número de un enlace directo de Home Depot. Una sesión revocada se distingue de un fallo temporal y del límite de consultas; el propietario puede restablecerla en `/settings/inventory`, conservando la compatibilidad de los enlaces administrativos anteriores. Las credenciales siguen exclusivamente en el servidor.
- El logo propio usa el radar circular de la referencia, vectorizado en `public/favicon.svg`. Barra lateral, pie de página, conexión y carga comparten ese archivo. Durante la carga gira únicamente el cono blanco, manteniendo fijos el círculo pequeño y el resto del ojo, sobre un fondo liso sin círculos decorativos; el modo de movimiento reducido deja el logo fijo.
- La interfaz, los detalles y las exportaciones muestran Clearance Radar y omiten las referencias visibles al proveedor. Se retiró la descripción genérica del feed; los endpoints y enlaces de compra necesarios para la integración mantienen sus destinos originales.

- Los precios de publicaciones en tienda son referencias: se conservan como `publishedAmount`, pero no cuentan como precio local ni generan porcentajes de descuento, filtros de precio máximo o rankings de ahorro. La ficha de Home Depot prioriza los resultados por ZIP: muestra el rango reportado únicamente entre sucursales con existencias, distingue las tiendas agotadas y señala cuando ninguna confirma el importe publicado. Una consulta de más de cinco minutos deja de aportar un precio reciente.
- Las publicaciones online y Staff Picks muestran de forma explícita que el precio no está verificado en el comercio; los porcentajes se identifican como publicados y el botón invita a comprobar el precio. `isActive` y la fecha de vigencia de la fuente no verifican el importe. Los reportes concretos de discrepancia se mantienen en `lib/deal-price-reviews.ts`: se oculta el precio y descuento de esa publicación y queda fuera del listado normal hasta revisión, sin inventar un precio sustituto. Si la fuente cambia el importe reportado, el reporte anterior deja de aplicarse, pero el nuevo importe sigue sin verificar.
- Revisión de precios en catálogo y Staff Picks: separa total de paquete y precio por unidad cuando el texto es explícito. Ejemplo: Atkins recibido a USD 1, cuya descripción indica USD 13 por 12, se muestra a USD 13 por paquete, aproximadamente USD 1,08 por unidad, con cupón, suscripción y variación por cuenta. Es una aclaración de la publicación, no una verificación del precio actual de Amazon.
- Los importes ausentes o contradictorios se ocultan por defecto. El filtro **Mostrar ofertas con precio por confirmar** permite consultarlos sin presentar un precio o descuento dudoso. Descuentos, filtros y ordenación usan el total aclarado; la exportación conserva los campos originales y añade `displayPrice`. Las condiciones se detectan de forma conservadora; no se consulta automáticamente el precio del comercio ni se garantiza que todo error del origen sea detectable.
- Regresiones de precios: `node --experimental-strip-types --test tests/offer-price.test.mjs tests/deals.test.mjs tests/staffspicks.test.mjs`.

- Carga todas las páginas con hasta tres peticiones en curso: dos del catálogo y una del feed, para que las ofertas en tienda lleguen antes. Los inicios se separan al menos 1,25 segundos, sin sumar esa espera a cada respuesta. Ante HTTP 429 todos los trabajadores comparten la pausa y respetan Retry-After. El catálogo prevalece sobre duplicados del feed, independientemente del orden de llegada.
- Los filtros usan letra más grande y accesos fijos a Home Depot, Walmart, Amazon, Woot, Target y Discord desde el inicio. El selector conserva ese orden, incluye otras tiendas conocidas y añade las nuevas al final.
- Por defecto carga activas; **Incluir historial** vuelve a cargar también las inactivas/vencidas. Los contadores y filtros corresponden al conjunto recibido.
- Los resultados se presentan en páginas de 24 tarjetas, sin limitar el conjunto de datos descargado.
- Un fallo de carga conserva datos parciales y muestra el error; no se simulan productos ni se presentan datos parciales como completos.
- Actualización manual mediante el botón Sincronizar.
- Búsqueda, tiendas, descuento, estado, etiquetas, precio, orden, cuadrícula/lista y exportación JSON.
- Favoritos guardados en localStorage. Se muestran solo los que están presentes en el catálogo cargado; activar historial permite encontrar favoritos vencidos.
- Detalle con texto, precios USD, fechas en America/Cancun, cupones copiables, respuesta JSON y resolución real de Get Deal.
- Actividad de API muestra las últimas 600 peticiones de la sesión y la última respuesta de catálogo. No inspecciona la red de otras pestañas.

## Servidor

`/api/deals` y `/api/redirect` son proxies de lectura con rutas fijas, validación de parámetros, timeout de 20 segundos y respuestas privadas sin caché. Sin configuración funcionan en modo público. Opcionalmente usan HC_ACCESS_TOKEN del servidor; no reciben cookies del navegador de los visitantes. El servidor evita depender del CORS del servicio externo; solo acepta los parámetros necesarios y no permite destinos arbitrarios.

## Límites

La paginación por número no es una instantánea atómica: ofertas añadidas o eliminadas mientras se carga pueden causar diferencias entre elementos únicos y total reportado. La exportación conserva ambos valores. Se respeta cualquier respuesta de error o limitación de la API, incluidos 401/403/429. Ante 429 se conserva el avance, se espera al menos 65 segundos o Retry-After (lo que sea mayor) y se reintenta la misma página hasta tres veces antes de mostrar error. El servicio externo puede cambiar sus rutas, esquema o disponibilidad. Las imágenes se cargan desde las URLs que devuelve el origen. El precio y disponibilidad definitivos se comprueban en la tienda. No hay base de datos ni copia persistente del catálogo.


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

## Sesión compartida de Hidden Clearances

En producción, los visitantes introducen únicamente su ZIP en la ficha de Home Depot. La sesión del propietario vive cifrada en el servidor, no se entrega a los visitantes y se renueva automáticamente antes de vencer. Las rutas de catálogo, feed, redirección y stock comparten la conexión. Las ofertas del feed conservan sku (Internet #) y las entradas restringidas locked: true se omiten.

### Configuración del alojamiento

- HC_SHARED_SESSION_MODE=true activa la sesión compartida.
- HC_SESSION_SECRET: clave aleatoria de exactamente 32 bytes en base64url, como secreto de servidor. Producción y Preview usan claves distintas.
- BLOB_READ_WRITE_TOKEN o BLOB_STORE_ID + VERCEL_OIDC_TOKEN: acceso al almacén **privado** de Vercel Blob. Se conectó clearance-session-vault al proyecto clearance. Los datos se separan por VERCEL_ENV: production, preview y development.
- HC_ADMIN_SETUP_HASH: SHA-256 de la invitación privada inicial del propietario.
- HC_ADMIN_SETUP_EXPIRES_AT: vencimiento de esa invitación en milisegundos Unix.

Ninguna variable lleva prefijo NEXT_PUBLIC_. No se guardan secretos en código, Git ni URLs de consulta. La clave anónima de Supabase en lib/hc-public.ts es la publicada por Hidden Clearances y no concede una sesión.

### Conexión del propietario

El propietario abre una invitación privada en /connect/hidden-clearances#setup=… . El fragmento se retira inmediatamente de la dirección. Abrir la página no consume la invitación: el propietario pulsa «Autorizar este navegador» para canjearla mediante POST del mismo origen. Los enlaces nuevos en la misma pestaña se procesan de nuevo y eliminan errores anteriores. El hash se consume una sola vez en almacenamiento privado. Se emite una cookie administrativa firmada, HttpOnly, Secure en HTTPS y con prefijo __Host-, válida 30 días. Si se pierde o vence ese acceso, se necesita otra invitación generada desde la administración del alojamiento.

Solo el propietario ve el marcador de conexión y puede conectar, reemplazar o desconectar el inventario. Los visitantes no reciben enlaces de conexión ni permisos de escritura. La API exige la cookie administrativa y el mismo origen para POST/DELETE.

El marcador se guarda y activa en la sesión habitual de Hidden Clearances. Toma únicamente sus tokens de acceso y renovación; no copia la contraseña, la sesión de Google, el perfil ni cookies de analítica. Usa postMessage con destino y origen exactos, ventana comprobada y desafío aleatorio con vencimiento. El propietario confirma la conexión en Radar. El servidor verifica la identidad con el emisor antes de guardar una copia cifrada AES-GCM en Blob privado. La invitación administrativa no se incluye en el marcador.

### Renovación y persistencia

Las consultas leen el estado privado actualizado sin caché CDN. Las escrituras condicionales usan el ETag de los metadatos de Blob, leído antes del contenido, para evitar diferencias debidas a la representación comprimida de la descarga. Al quedar dos minutos de vigencia se obtiene un lease mediante escritura condicional ETag antes de renovar. Así se coordinan instancias del servidor. El token reemplazado se guarda cifrado mediante compare-and-swap; una renovación antigua no puede sobrescribir una conexión nueva del propietario. Los fallos temporales conservan la credencial para reintentar. Una credencial revocada elimina la conexión y requiere intervención del propietario. Se respeta la duración y revocación del proveedor, sin prometer acceso permanente.

Los visitantes reciben solo los resultados del inventario y metadatos de estado, nunca tokens ni cookies de Hidden Clearances. Una conexión no concede Premium ni permite saltar restricciones del origen. Las respuestas usan private, no-store. HC_ACCESS_TOKEN y la conexión por cookie siguen compatibles para entornos anteriores sin HC_SHARED_SESSION_MODE; producción usa exclusivamente el almacén compartido.

### Validación

Pruebas de sesión, rotación, concurrencia, reemplazo durante una renovación, acceso administrativo, transporte y enlaces: `node --experimental-strip-types --test tests/deals.test.mjs tests/hc-session.test.mjs tests/hc-renewal.test.mjs tests/hc-bridge.test.mjs tests/hc-shared.test.mjs tests/store-stock.test.mjs`. Compilación: `npm run build:vercel`. Las pruebas de tokens usan fixtures sintéticos y un emisor simulado. Se distinguen enlaces inválidos, vencidos y usados de los fallos de almacenamiento; los registros guardan únicamente códigos de causa, nunca invitaciones o tokens. La comprobación de stock real requiere conectar primero la sesión real del propietario.

Referencias: [sesiones de Supabase](https://supabase.com/docs/guides/auth/sessions), [Vercel Blob privado y escrituras condicionales](https://vercel.com/docs/vercel-blob).


## Staffspicks — Clearance Explorer

Nueva sección independiente en la barra lateral. Usa GET /api/staffspicks como proxy de lectura de /api/deals?source_type=user&sort=recent&page=N&limit=12. Carga al aproximarse a 300 px del final, con botón manual alternativo, una solicitud a la vez y separación mínima de 1,25 s. Deduplica por ID, conserva resultados ante errores y respeta Retry-After. Los filtros de tienda/descuento/orden reinician las páginas; la búsqueda y los favoritos solo abarcan lo cargado.

La vista sin credenciales entrega únicamente la primera página pública (6 ofertas en la comprobación del 28 de octubre de 2026), marcada como limitada. No presenta esa vista como un catálogo completo ni intenta saltar la autenticación.

### Sesión

Configurar CE_ACCESS_TOKEN como secreto del servidor en Sites o Vercel y volver a desplegar; en local puede usarse .env.local, ignorado por Git. Nunca usar NEXT_PUBLIC_. Se envía exclusivamente a https://clearanceexplorer.com en las rutas fijas del catálogo/detalle. No se acepta un destino arbitrario ni se devuelve el token al cliente. El JWT se revisa para detectar formato, issuer y caducidad; la API de origen valida su autenticidad y permisos. Las respuestas usan private, no-store.

Los tokens de sesión de Clerk caducan; guardar un token no garantiza una conexión permanente. Para renovación bajo demanda se admite CE_CLIENT_TOKEN (solo el valor de la cookie __client de clerk.clearanceexplorer.com) junto con CE_SESSION_ID (sess_…). El servidor solicita un token nuevo a POST https://clerk.clearanceexplorer.com/v1/client/sessions/{id}/tokens y reutiliza el JWT en memoria hasta 10 segundos antes de vencer. No se envían cookies de Google/Twitter ni se modifica el estado de login. La renovación depende de que la sesión original siga válida; no prolonga una sesión revocada ni garantiza duración indefinida. Este flujo requiere verificación con las credenciales reales; sin ellas solo se ha comprobado el contrato mediante pruebas. Si el origen rechaza la renovación, se detiene con un aviso. La sesión del navegador original no se transfiere automáticamente al servidor. Al terminar esta implementación todavía no se había proporcionado CE_ACCESS_TOKEN: la carga autenticada queda pendiente de configuración y prueba con una credencial válida.

### Detalle y compra

El proxy lee el HTML/RSC de /u/slug y extrae solo el objeto de oferta y viewDealUrl correspondiente, sin ejecutar scripts ni insertar HTML externo. El botón de compra conserva la URL original y sus afiliados; no reproduce los POST de vistas, likes o guardados del origen. Los favoritos de esta sección son locales. Se omiten los identificadores de autores y metadatos de cuentas. Los precios se conservan tal como vienen, aun si el título anuncia otra cantidad; cero muestra Ver condiciones.

Verificación: node --experimental-strip-types --test tests/staffspicks.test.mjs. La inspección del flujo observó el scroll añadiendo 12 → 23 → 32 tarjetas únicas y el CTA de Kobe IX redirigiendo a Nike.
## Home Depot: ZIP y enlaces de sucursal

El detalle de las ofertas de Home Depot importadas del feed permite introducir un ZIP de Estados Unidos, consultar tiendas cercanas y abrir el producto directamente en una sucursal. El feed conserva `sku` (Internet #) para esta consulta. El enlace usa `https://www.homedepot.com/p/{sku}?store={storeId}`; el código de tienda se conserva como texto, incluidos ceros iniciales. La lista muestra dirección, distancia en millas, existencias, ubicación y precio de cada sucursal cuando la fuente los incluye. Se ordena por cercanía, con las tiendas con stock primero; las que no tienen stock se muestran opcionalmente. No se interpreta el precio general de la oferta como el precio de todas las sucursales.

`GET /api/stock?sku=339011675&zip=33101` es un proxy de servidor hacia la ruta fija `/api/v1/homedepot/stock`. Valida los identificadores, usa `HC_ACCESS_TOKEN`, no devuelve credenciales, no sigue redirecciones y conserva `Retry-After`. El formulario respeta la espera ante 429, cancela consultas al cerrar la ficha y distingue errores de autenticación de inventario vacío. Las ofertas sin un número de producto válido conservan un enlace explícito a la fuente.

Estado de autenticación: esta API requiere una sesión. Está integrada con la conexión y renovación automática descritas arriba. La conexión inicial es exclusiva del propietario: requiere activar el marcador en Hidden Clearances y confirmarla en Radar. No se han extraído las credenciales reales de la pestaña del agente; las pruebas de renovación usan sesiones sintéticas y un emisor simulado.

Comprobación del 6 de noviembre de 2026: la página original autenticada devolvió siete sucursales con stock para el ZIP de prueba 33101; N Miami Beach usa `store=0251`. El formulario local y los estados HTTP 400/401 se verificaron; la consulta local con sesión vigente queda pendiente porque la credencial configurada está vencida. El proyecto antiguo de Sites devolvió `Sites project not found`. Se verificó que el repositorio actual publica https://clearance-two.vercel.app en Vercel. El acceso a Vercel está autorizado y el almacenamiento privado y las claves de cifrado están configurados.

Pruebas: `node --experimental-strip-types --test tests/deals.test.mjs tests/hc-session.test.mjs tests/store-stock.test.mjs`. Compilación: `npm run build:vercel`.
