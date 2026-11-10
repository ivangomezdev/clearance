# Cuentas en Vercel con Supabase

La aplicación ya incluye `/login`, `/registro`, `/cuenta` y el retorno de confirmación `/auth/callback`. No se cambia la conexión de inventario existente.

## 1. Crear la base de datos

Crea un proyecto en [Supabase](https://supabase.com/dashboard). En **SQL Editor**, ejecuta una vez el archivo [202611100001_accounts.sql](../supabase/migrations/202611100001_accounts.sql). El script crea `profiles`, el disparador de registro y las políticas de acceso.

Las contraseñas las gestiona **Supabase Auth**. La tabla `profiles` guarda el usuario, la fecha de nacimiento y el plan inicial `free`. El email pertenece a Supabase Auth. Los usuarios solo pueden leer su propio perfil; no pueden cambiar el plan. No se necesita una clave `service_role`.

## 2. Añadir dos variables en Vercel

En **Project Settings → Environment Variables**, añade estas variables para Production (y Preview si lo usas), y vuelve a desplegar:

```dotenv
SUPABASE_URL=https://TU_PROYECTO.supabase.co
SUPABASE_PUBLISHABLE_KEY=TU_CLAVE_PUBLICABLE
```

Encuentra ambas en la configuración API del proyecto de Supabase. También se admite la antigua clave `anon` como valor de `SUPABASE_PUBLISHABLE_KEY`. Nunca uses una clave secret o `service_role`.

Para desarrollo, copia las variables a `.env.local`, que no se versiona. Las claves vacías de `.env.example` son solo una plantilla.

## 3. Configurar la confirmación por email

En **Authentication → URL Configuration** de Supabase:

- Site URL: `https://clearance-two.vercel.app`.
- Redirect URLs: `https://clearance-two.vercel.app/auth/callback`.
- Para desarrollo: `http://127.0.0.1:3010/auth/callback` (o el puerto que utilices).
- Añade las URL concretas de tus previews si también quieres probar el registro allí.

Activa el proveedor **Email** y conserva la confirmación de correo. El enlace usa PKCE: ábrelo en el mismo navegador donde hiciste el registro. Para producción configura tu SMTP en Supabase; el servicio de prueba de envío tiene restricciones. Consulta [el envío de email de Supabase](https://supabase.com/docs/guides/auth/auth-smtp).

## Comprobar

1. Registra una cuenta de prueba con usuario, email, contraseña y fecha de nacimiento.
2. Confirma el email desde el mismo navegador.
3. La barra lateral debe mostrar el usuario y **Plan Gratis**. Recarga y comprueba que sigue conectado.
4. Cierra sesión y verifica que reaparecen **Iniciar sesión** y **Registrarse**.

Los cambios futuros de plan se hacen desde un proceso de servidor autorizado o desde SQL; el registro no admite un plan enviado por el navegador. No se ha añadido cobro ni una suscripción de pago.

Hasta que estén configuradas las variables y ejecutado el SQL, las páginas se pueden visitar pero no aceptan registros ni simulan una sesión. Las cookies de cuenta son HttpOnly y usan Secure bajo HTTPS. La API obtiene la identidad con `getUser()` y lee el plan de la base de datos, sin confiar en metadatos editables del usuario.

Pruebas locales: `node --experimental-strip-types --test tests/account.test.mjs`. Estas ejecutan el SQL en PostgreSQL embebido y verifican los permisos, las fechas, los nombres únicos y el plan inicial.

Después del build, `node tests/account.integration.mjs` verifica las rutas HTTP y las cookies de la aplicación usando un servicio Auth local con cuentas sintéticas, sin enviar datos a Supabase real.

Referencias: [autenticación de servidor de Supabase](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [perfiles y disparadores](https://supabase.com/docs/guides/auth/managing-user-data).
