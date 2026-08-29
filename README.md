# Pavéland · You Pick The Next One

Votación de kiosco para elegir el próximo **Postre del Mes**.
El cliente toca una foto, se registra +1 voto, y el iPad vuelve solo a la
pantalla inicial listo para la siguiente persona. Sin nombre, sin correo,
sin formularios, sin botones que alguien tenga que presionar.

---

## 1. Puesta en marcha (una sola vez, ~10 minutos)

### Paso 1 · Crear la base de datos

1. Entra a **https://supabase.com** y crea una cuenta gratis.
2. **New project**. Ponle nombre `paveland-votacion`, elige región
   *East US (North Virginia)* y guarda la contraseña que te genere.
3. Cuando el proyecto esté listo, abre **SQL Editor → New query**.
4. Abre el archivo `supabase/schema.sql` de esta carpeta, copia **todo** su
   contenido, pégalo y pulsa **Run**.
   Debe decir *Success*. Eso crea las tablas, las reglas de seguridad,
   la carpeta de fotos y una campaña inicial con `Postre #1`, `#2` y `#3`.

### Paso 2 · Crear tu usuario de administrador

1. **Authentication → Users → Add user → Create new user**.
2. Pon tu correo y una contraseña.
3. **Marca la casilla “Auto Confirm User”** (si no, no podrás entrar).

Esa es la única cuenta que puede ver resultados y cambiar cosas.
Los clientes nunca crean cuenta.

### Paso 3 · Conectar la app

1. **Project Settings → API**.
2. Copia **Project URL** y **anon public**.
3. Ábrelos en `assets/js/config.js` y pégalos:

```js
window.PAVELAND_CONFIG = {
  SUPABASE_URL: 'https://xxxxxxxx.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOi...',
  ...
};
```

> La `anon key` está hecha para vivir en el navegador: es pública a propósito.
> Quien la vea **no** puede inflar votos ni cambiar nombres, porque las reglas
> RLS solo le permiten leer y llamar a la función de voto.
> **Nunca pegues aquí la `service_role key`.**

### Paso 4 · Publicarlo

**La forma más rápida (sin instalar nada):**

1. Entra a **https://app.netlify.com/drop**.
2. Arrastra la carpeta `paveland-vote` completa a la página.
3. En segundos te da un enlace tipo `https://algo-random.netlify.app`.
4. En **Site configuration → Change site name** ponle
   `paveland-vota` → `https://paveland-vota.netlify.app`.

Para actualizar después: entra al sitio en Netlify, pestaña **Deploys**, y
arrastra la carpeta otra vez.

*Alternativas:* Vercel (`vercel deploy`), Cloudflare Pages o GitHub Pages
funcionan igual — es un sitio estático, no necesita servidor.

---

## 2. Dejar el iPad en modo kiosco

1. Abre **Safari** y entra a tu enlace.
2. Toca **Compartir** → **Añadir a pantalla de inicio**. Ponle “Votación”.
3. Ábrelo desde ese icono: arranca **a pantalla completa**, sin barra de
   direcciones ni pestañas. El cliente no puede salirse navegando.
4. **Ajustes → Pantalla y brillo → Bloqueo automático → Nunca.**
5. **Ajustes → Accesibilidad → Acceso guiado → Activado.**
   Con la app abierta, pulsa el botón lateral **3 veces** y toca *Iniciar*.
   Eso deja el iPad encerrado en la votación: nadie puede salir sin tu código.

La app además pide **Wake Lock**, mantiene la pantalla encendida y bloquea el
zoom por doble toque y por pellizco.

---

## 3. Uso diario

### Entrar al panel

Dos caminos:

- Escribe la dirección: `https://tu-sitio.netlify.app/admin`
- O, **desde el propio iPad**, mantén el dedo **2.5 segundos sobre el logo**
  de Pavéland. Es un atajo oculto: no hay ningún enlace visible para el
  cliente. Luego entras con tu correo y contraseña.

### Cambiar los nombres

Panel → sección **Los tres postres** → edita el campo *Nombre* → **Guardar
cambios**.

Si un nombre es largo, la app **encoge la letra automáticamente** para que las
tres tarjetas sigan midiendo exactamente lo mismo.

### Cambiar las fotos

Dos opciones, en la misma sección:

- **Subir foto desde el dispositivo** — elige la imagen del iPad o la
  computadora, se sube sola a Supabase Storage y queda pública. Máximo 8 MB.
- **URL de la foto** — si ya la tienes en Instagram, Drive o tu web, pega la
  dirección directa.

Luego **Guardar cambios**. Lo ideal es una foto cuadrada o 4:3 de al menos
1200 px. No importa si son de proporciones distintas: la app las recorta al
mismo tamaño y **nunca las deforma**.

### Ver resultados

El panel muestra el total, el ranking con 🥇🥈🥉, los votos de cada postre, los
porcentajes y una gráfica de barras. **Se actualiza solo**, en vivo, sin
refrescar. El indicador *En vivo* se pone en ámbar si se pierde la conexión.

### Resetear una votación

Panel → **Empezar de nuevo** → **Resetear votos**.
Pide confirmación mostrando cuántos votos se van a borrar. Conserva los
nombres y las fotos, solo pone los contadores en cero.

### Empezar una campaña nueva

Panel → **Iniciar nueva campaña**. Archiva la votación actual **con sus
resultados** (no se pierden, quedan guardados en la base) y abre una limpia
con los tres nombres nuevos que escribas.

---

## 4. Cómo funciona la base de datos

Tres tablas en Postgres (Supabase):

| Tabla | Para qué sirve |
|---|---|
| `campaigns` | Cada votación. Solo una puede estar activa (lo garantiza un índice único). |
| `desserts` | Los 3 postres de la campaña: posición, nombre, foto y contador. |
| `vote_events` | Un registro por cada toque. Auditoría. **No guarda ningún dato personal.** |

### El voto es atómico

El voto **no** se calcula en el navegador. Se llama a la función
`cast_vote()` en el servidor, que hace:

```sql
update desserts set votes = votes + 1 where id = ...
```

Postgres bloquea esa fila mientras la actualiza, así que si dos iPads votan en
el mismo milisegundo, los dos votos se cuentan. Si en vez de eso se leyera el
número, se sumara en JavaScript y se volviera a escribir, uno de los dos votos
se perdería. Por eso está hecho así.

### Si se cae el internet, el voto no se pierde

Si el wifi falla justo cuando alguien vota, el voto se guarda en el iPad y se
reintenta solo — al recuperar señal, cada 15 segundos y al abrir la página —
hasta que el servidor lo confirme. El panel muestra cuántos hay en cola.

### Seguridad

Las reglas **RLS** están activas en las tres tablas:

- Cualquiera puede **leer** campaña y postres (la pantalla pública lo necesita).
- Solo un administrador con sesión iniciada puede **escribir**.
- Nadie puede escribir en `vote_events` directamente.
- Votar solo es posible llamando a `cast_vote()`, que suma exactamente 1.

---

## 5. Archivos

```
paveland-vote/
├── index.html              Pantalla de votación (el kiosco)
├── admin.html              Panel privado
├── netlify.toml            Cabeceras y ruta /admin
├── _redirects              Lo mismo, para Netlify Drop
├── robots.txt              No indexar en buscadores
├── assets/
│   ├── css/brand.css       Paleta y tipografía del manual de marca
│   ├── js/config.js        ← EL ÚNICO ARCHIVO QUE EDITAS
│   ├── js/data.js          Todo lo que habla con Supabase
│   └── img/                Logos Pavéland (recortados)
└── supabase/schema.sql     Tablas, funciones, RLS y permisos
```

---

## 6. Marca

Tomado del *Manual de Marca Pavéland*:

| Color | Hex | Pantone |
|---|---|---|
| Crema | `#FAE6C5` | 7584 C |
| Caramelo | `#E8AD72` | 721 C |
| Marrón | `#9C532C` | 7499 C |
| Cacao | `#744423` | 7586 C |

Tipografía: **Caooli** (títulos) y **Montserrat** (texto).
Caooli no está en Google Fonts, así que la app usa **Fredoka** como sustituto
redondeado del mismo carácter. Si consigues Caooli como webfont, colócala en
`assets/fonts/` y añade su `@font-face` en `brand.css`: la app ya la busca
primero y la usará automáticamente.

---

## 7. Solución de problemas

| Síntoma | Qué hacer |
|---|---|
| “Falta conectar la base de datos” | Faltan las llaves en `assets/js/config.js`. |
| “No hay una votación activa” | Entra a `/admin` y pulsa *Iniciar nueva campaña*. |
| No puedo entrar al panel | ¿Marcaste *Auto Confirm User* al crear el usuario? |
| Las fotos no se suben | Vuelve a ejecutar la sección 7 de `schema.sql` (el bucket). |
| El panel dice “Reconectando” | Se cayó el websocket. Sigue refrescando cada 8 s por su cuenta. |
