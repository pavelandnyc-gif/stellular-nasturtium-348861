# Jarvis · Tu asistente personal

Jarvis es una aplicación web que se instala en la pantalla de inicio de tu iPhone, como una app. Te ayuda a:

- guardar **ideas**;
- organizar **pendientes**;
- recibir **recordatorios** aunque la app esté cerrada;
- mantener **hábitos**, como hacer ejercicio y leer.

Le puedes escribir o hablar en español.

---

## 1. Cómo está hecho (en sencillo)

```
 iPhone (Safari / app instalada)
        │  HTTPS
        ▼
 Vercel ── App Jarvis (Next.js) ──────────────► Claude (IA de Anthropic)
        │   · pantallas                         entiende tus mensajes y usa
        │   · "herramientas" del servidor       herramientas validadas
        │     que validan y guardan
        ▼
 Supabase
   · Auth (tu cuenta)
   · PostgreSQL (ideas, tareas, hábitos, cola de avisos)
   · pg_cron: cada minuto llama a /api/cron/dispatch
                         │
                         ▼
               Servicio push de Apple ──► notificación en tu iPhone
```

- **La app (Next.js + TypeScript + Tailwind)** es a la vez lo que ves y el "servidor". Las claves secretas viven solo en el servidor.
- **Base de datos (PostgreSQL en Supabase):** todo queda guardado. Lo ves igual desde cualquier dispositivo en el que inicies sesión.
- **Cuenta (Supabase Auth):** entras con correo y contraseña. Solo pueden entrar los correos que pongas en `ALLOWED_EMAILS`. El servidor comprueba tu sesión en cada petición.
- **Inteligencia artificial (Claude):** el modelo se puede cambiar. Jarvis no guarda nada "de memoria": usa herramientas del servidor (crear tarea, buscar ideas, etc.) que revisan cada dato antes de guardarlo. Solo te confirma algo si de verdad se guardó.
- **Recordatorios:** cada aviso es una fila en una "cola" dentro de la base de datos. Supabase revisa la cola cada minuto (`pg_cron`) y envía lo que toca por Web Push. No depende de que tengas la app abierta.

---

## 2. Qué incluye

| Área | Funciones |
|---|---|
| **Inicio** | Saludo, tareas de hoy y vencidas, hábitos de hoy, próximas alertas, acceso a Jarvis y botón ＋ de captura rápida. |
| **Jarvis** | Chat en español con micrófono (si el navegador lo permite) y dictado del teclado. Confirmaciones con la fecha y hora exactas que entendió. |
| **Ideas** | Guardar, buscar, filtrar ("esta semana"), editar, borrar y convertir en tarea. |
| **Pendientes** | Fecha, hora y prioridad opcionales. Listas de vencidas, hoy, próximas y sin fecha. Completar, posponer (15 min, 1 h, 3 h, mañana), reprogramar, eliminar e historial de completadas. |
| **Repeticiones** | Diaria, semanal o días elegidos. Completar una repetición avanza a la siguiente sin perder la serie. |
| **Hábitos** | "Hacer ejercicio" y "Leer" como sugerencias que puedes activar, más los tuyos. Frecuencia, hora opcional, registro diario, racha y los últimos 7 días. Marcar hoy no cambia las próximas repeticiones. Si dejas un hábito, te anima a retomarlo sin regaños. |
| **Avisos** | Web Push con la app cerrada. Botón para activarlos, botón de prueba e historial con estados. Al tocar un aviso se abre la tarea, y desde ahí puedes completarla o posponerla. |
| **Resumen diario** | Opcional, a la hora que elijas, armado con tus datos reales en el momento de enviarse. |
| **Ajustes** | Nombre, zona horaria (por defecto America/New_York, con horario de verano), resumen, notificaciones, estado de la IA y cuenta. |

### Garantías de los avisos

- **Sin duplicados.** Cada aviso de cada repetición tiene una clave única. Si el programador corre dos veces a la vez, solo uno lo toma (`FOR UPDATE SKIP LOCKED`). Además, el servicio push y el iPhone reemplazan un aviso repetido en vez de mostrarlo dos veces.
- **Reintentos controlados.** Si Apple responde con un error temporal, se reintenta a los 1, 5 y 15 minutos (máximo 4 intentos). Si tu iPhone ya no está suscrito, se borra esa suscripción.
- **Cambios en la tarea.** Si cambias, completas o borras una tarea, su aviso pendiente se actualiza o se cancela.
- **Avisos atrasados.** Si un aviso lleva más de 6 horas de retraso (por ejemplo, porque el servidor estuvo caído), no se envía tarde.
- **Dos estados distintos:**
  - **"Enviado al servicio push":** Apple aceptó el aviso.
  - **"Recibido por el dispositivo":** tu iPhone confirmó que le llegó.

  La entrega puede retrasarse o no llegar si el iPhone no tiene conexión, está en modo Concentración o Ahorro de energía, o si desactivas las notificaciones de Jarvis en iOS.

---

## 3. Probarlo en tu computadora (vista previa)

Necesitas [Node.js 20 o superior](https://nodejs.org).

```bash
cd jarvis
npm install
cp .env.example .env.local
npm run vapid            # copia las dos claves VAPID en .env.local
```

En `.env.local` deja `NEXT_PUBLIC_SUPABASE_URL` vacío y rellena:

```
LOCAL_AUTH_PASSWORD=una-contraseña-para-la-prueba
SESSION_SECRET=   (cadena larga al azar: openssl rand -hex 32)
CRON_SECRET=      (otra cadena al azar)
```

Después:

```bash
npm run build && npm start     # abre http://localhost:3000
npm run scheduler              # (en otra terminal) el programador, cada minuto
```

En modo vista previa los datos se guardan en `jarvis/.data/`, una base PostgreSQL local, sin Supabase. Las migraciones se aplican solas.

Pruebas automáticas: `npm test`.

---

## 4. Publicarlo en internet con HTTPS (paso a paso)

Usaremos tres servicios con plan gratuito: **Supabase**, **Vercel** y **Anthropic**. Este último es de pago por uso; los costos están en la sección 6.

### Paso 1 · Supabase (base de datos y cuenta)

1. Entra a <https://supabase.com> con tu cuenta (ya tienes una por Pavéland) y crea un **New project** llamado `jarvis`, región *East US*. Guarda la contraseña de la base de datos.
2. **Authentication → Users → Add user → Create new user.** Escribe tu correo y una contraseña, y marca **Auto Confirm User**.
3. **Authentication → Sign In / Providers → desactiva "Allow new users to sign up".** Así nadie más puede crear cuentas. Además, Jarvis solo deja entrar a los correos de `ALLOWED_EMAILS`.
4. Anota estos datos:
   - **Project Settings → API:** *Project URL* y la clave *publishable* (o *anon*).
   - **Project Settings → Database → Connection string → Transaction pooler** (puerto 6543): cambia `[YOUR-PASSWORD]` por tu contraseña. Ese es tu `DATABASE_URL`.

No hace falta crear tablas a mano: Jarvis las crea la primera vez que arranca. Si prefieres hacerlo tú, pega `db/migrations/0001_init.sql` en el *SQL Editor*.

### Paso 2 · Claves que generas tú

En tu computadora, dentro de la carpeta `jarvis`:

```bash
npm install
npm run vapid                 # VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY
openssl rand -hex 32          # úsalo como CRON_SECRET
```

### Paso 3 · Vercel (la app en HTTPS)

1. Entra a <https://vercel.com> con tu cuenta de GitHub. Elige **Add New → Project** e importa este repositorio.
2. En **Root Directory** elige `jarvis`. Vercel detecta Next.js solo.
3. En **Environment Variables** pega estas variables:

| Variable | Valor |
|---|---|
| `APP_URL` | `https://<tu-proyecto>.vercel.app` (puedes ajustarla después del primer despliegue) |
| `DATABASE_URL` | La del *Transaction pooler* del paso 1 |
| `NEXT_PUBLIC_SUPABASE_URL` | *Project URL* |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave *publishable/anon* |
| `ALLOWED_EMAILS` | Tu correo |
| `ANTHROPIC_API_KEY` | Tu clave de Anthropic (paso 4; opcional al principio) |
| `AI_MODEL` | `claude-opus-5-5` (o `claude-haiku-5-5` para gastar menos) |
| `AI_EFFORT` | `low` |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Del paso 2 |
| `VAPID_SUBJECT` | `mailto:tu-correo` |
| `CRON_SECRET` | Del paso 2 |

4. Pulsa **Deploy**. En uno o dos minutos tendrás `https://<tu-proyecto>.vercel.app`.

> **¿Por qué no usamos el "Cron" de Vercel?** En el plan gratuito solo corre una vez al día, y Jarvis necesita revisar la cola cada minuto. Por eso el programador vive en Supabase.

### Paso 4 · IA (opcional, se puede añadir después)

En <https://console.anthropic.com>:

1. Crea una cuenta y añade un método de pago con un **límite de gasto mensual** (por ejemplo, 5 USD).
2. Crea una **API key** y ponla en Vercel como `ANTHROPIC_API_KEY`.
3. Vuelve a desplegar (**Deployments → Redeploy**).

Sin esta clave, Jarvis funciona completo con formularios. La pantalla de Jarvis te indicará que la conversación con IA requiere configuración.

### Paso 5 · Programador de avisos (pg_cron en Supabase)

1. Abre `db/supabase-cron.sql` y cambia `TU-APP.vercel.app` y `TU_CRON_SECRET` por tus valores.
2. Pégalo en Supabase → **SQL Editor** → **Run**.
3. A los 2 minutos, comprueba que funciona con:
   ```sql
   select status_code, content from net._http_response order by created desc limit 3;
   ```
   Debe mostrar `200` y algo como `{"ok":true,"claimed":0,...}`.

*Alternativa sin SQL:* crea una tarea en <https://cron-job.org> (gratis) que cada minuto haga `POST https://TU-APP/api/cron/dispatch` con la cabecera `Authorization: Bearer TU_CRON_SECRET`.

---

## 5. Agregar Jarvis a tu iPhone

1. Abre **Safari** (iOS 16.4 o posterior) y entra a `https://<tu-proyecto>.vercel.app`.
2. Toca **Compartir** (el cuadrado con la flecha ⬆︎).
3. Elige **Agregar a pantalla de inicio**, deja el nombre "Jarvis" y toca **Agregar**.
4. Abre Jarvis **desde el ícono nuevo** e inicia sesión. La app instalada no comparte la sesión con Safari, así que tienes que entrar de nuevo aquí.
5. Ve a **Ajustes (⚙︎) → Notificaciones → Activar notificaciones** y acepta el permiso.
6. Toca **Enviar prueba**. Debe llegarte un aviso y verse "Recibido por el dispositivo".

Dentro de la app, en **/instalar**, está esta misma guía con detección automática.

---

## 6. Costos (confírmalos antes de contratar)

| Servicio | Plan recomendado | Costo estimado | Notas |
|---|---|---|---|
| **Hosting** (Vercel) | Hobby | **0 USD** | Para uso personal, no comercial. El programador llama 43 200 veces al mes, muy por debajo del límite. |
| **Base de datos y cuenta** (Supabase) | Free | **0 USD** | 500 MB de base de datos (sobra) y 2 proyectos por cuenta. Los proyectos gratuitos se pausan tras 7 días sin actividad; el uso diario y el programador lo mantienen activo. Pro cuesta 25 USD/mes y no se pausa. |
| **IA** (Anthropic, pago por uso) | `claude-opus-5-5` | ≈ **8–15 USD/mes** con ~15 mensajes al día | 4 USD por millón de tokens de entrada y 20 USD por millón de salida. Las instrucciones fijas se guardan en caché para pagar menos. |
| | `claude-haiku-5-5` | ≈ **menos de 1 USD/mes** | 0,10 USD / 0,50 USD por millón. Más simple, pero suficiente para frases cortas. |
| **Notificaciones** (Web Push) | — | **0 USD** | Apple no cobra por Web Push. |

**No he contratado nada de pago.** Antes de activar la IA, decide qué modelo usar y pon un límite de gasto en la consola de Anthropic.

---

## 7. Seguridad y privacidad

- Las claves privadas (base de datos, IA, VAPID, cron) solo existen como variables del servidor. Nunca llegan al navegador ni al repositorio (`.env*` está en `.gitignore`).
- Cada ruta del servidor verifica tu sesión (`getClaims()` valida la firma del token) y filtra todos los datos por tu usuario. Ni la IA puede tocar datos de otra persona.
- Las tablas están en el esquema privado `jarvis`, que la API pública de Supabase no expone, y tienen RLS activado sin permisos públicos.
- Todo lo que propone la IA se valida en el servidor antes de guardarlo (fechas reales, horas válidas, identificadores tuyos).
- Tus mensajes con Jarvis se envían a Anthropic para procesarlos. Puedes borrar la conversación desde la pantalla de Jarvis; tus tareas e ideas no se borran.

---

## 8. Archivos

```
jarvis/
├── src/app/(app)/        Pantallas: Inicio, Jarvis, Ideas, Hábitos, Pendientes, Ajustes
├── src/app/api/          Rutas del servidor (todas exigen sesión, salvo el cron y el acuse de recibo)
├── src/lib/scheduler.ts  Cola de avisos, reintentos, deduplicación y resumen diario
├── src/lib/time.ts       Fechas, repeticiones y horario de verano
├── src/lib/ai/           Jarvis: instrucciones y herramientas validadas
├── src/lib/repo/         Acceso a datos (ideas, tareas, hábitos, perfil)
├── public/sw.js          Service worker: recibe avisos y confirma la recepción
├── db/migrations/        Esquema de la base de datos
├── db/supabase-cron.sql  Programador cada minuto
├── tests/                Pruebas automáticas
└── .env.example          Variables de entorno de ejemplo
```
