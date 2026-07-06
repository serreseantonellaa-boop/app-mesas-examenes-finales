# Mis Mesas — con login de Google (Firebase)

Esta versión guarda todo en la nube (Firestore), atado a tu cuenta de
Google. Si entrás desde otro celular o compu con la misma cuenta, ves los
mismos datos. Las dos planillas de mesas siguen embebidas en
`assets/js/data.js` (no hace falta subir nada de eso).

No hace falta backend propio ni variables de entorno en Vercel: todo
corre en el navegador, usando el SDK de Firebase.

## 1. Crear el proyecto de Firebase

1. Andá a [console.firebase.google.com](https://console.firebase.google.com)
   y creá un proyecto nuevo (podés dejar Google Analytics desactivado, no
   hace falta).
2. En el menú lateral: **Compilación → Authentication → Comenzar**.
   Pestaña **Sign-in method** → habilitá **Google** → guardar.
3. En el menú lateral: **Compilación → Firestore Database → Crear base de
   datos**. Elegí una ubicación (cualquiera cercana, ej. `southamerica-east1`)
   y arrancá en **modo de producción**.
4. Andá a **Reglas** (dentro de Firestore) y reemplazá el contenido por
   esto, para que cada docente solo pueda leer y escribir sus propios
   datos:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /profesores/{uid} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```
   Click en **Publicar**.

## 2. Conectar la app con tu proyecto

1. En Firebase, andá a **⚙️ (arriba a la izquierda) → Configuración del
   proyecto**.
2. Abajo, en "Tus apps", click en el ícono **</>** (Web) para agregar una
   app. Ponele un nombre (ej: "mis-mesas-web") y **Registrar app** (no
   hace falta Firebase Hosting).
3. Te va a mostrar un bloque `firebaseConfig = {...}`. Copiá esos valores
   y pegalos en el archivo `assets/js/firebase-config.js` de esta carpeta,
   reemplazando los valores de ejemplo (`TU_API_KEY`, etc.). Estos datos
   no son secretos, está bien que queden visibles en el código del
   navegador.

## 3. Probar en tu compu

Antes de subir nada, abrí `index.html` con doble click en tu navegador.
Debería aparecer el botón "Iniciar sesión con Google". `localhost` y los
archivos abiertos localmente ya están autorizados por Firebase por
defecto, así que esta parte funciona sin tocar nada más.

## 4. Subir a Vercel

1. [vercel.com/new](https://vercel.com/new) → arrastrá esta carpeta (o
   subila a GitHub e importala). No hace falta configurar variables de
   entorno.
2. Cuando tengas la URL (ej. `https://mis-mesas-xxxx.vercel.app`), volvé a
   Firebase → **Authentication → Settings → Authorized domains** → **Add
   domain** → pegá ese dominio (sin `https://`, solo
   `mis-mesas-xxxx.vercel.app`). Si no hacés este paso, el login de Google
   va a fallar con un error de "dominio no autorizado".
3. Abrí la URL desde el celular e instalala ("Agregar a pantalla de
   inicio" / "Instalar app").

## 5. Habilitar Google Calendar (para el botón 📅 Calendar)

1. Andá a [console.cloud.google.com](https://console.cloud.google.com), asegurate
   de estar parada en el mismo proyecto (arriba, selector de proyecto → el que
   tiene el mismo nombre/ID que tu proyecto de Firebase).
2. Buscá **"Google Calendar API"** en el buscador de arriba → **Habilitar**.
3. La primera vez que alguien use el botón "📅 Calendar" en la app, Google va
   a mostrar una pantalla de permisos. Como la app todavía no está verificada
   por Google, puede aparecer un aviso de **"Google no verificó esta app"**.
   Hay que click en **Avanzado** → **Ir a (nombre de la app) (no seguro)** →
   continuar. Es solo un paso extra, no significa que algo esté mal.
4. Si querés evitar ese aviso para gente puntual mientras probás: en
   **APIs y servicios → Pantalla de consentimiento de OAuth → Público de
   prueba (Test users)**, agregá los mails de los profes que van a probarlo.

## Cómo queda guardado

Cada vez que tildás algo o agregás un alumno, se guarda automáticamente en
Firestore (vas a ver "Guardando…" y después "Guardado en la nube ✓" arriba).
Podés ver esos datos crudos en Firebase → Firestore Database → colección
`profesores` → tu usuario (un documento por cada docente que inicie sesión).

El botón **📅 Calendar** crea un evento en tu Google Calendar por cada mesa
que todavía no esté sincronizada (con recordatorio 1 día antes y 1 hora
antes), y marca cada una para no crearla dos veces. Las mesas ya
sincronizadas muestran "📅 En tu Google Calendar" debajo de los botones.

## Actualizar las mesas

Si te pasan una planilla nueva más adelante, avisame y te regenero
`assets/js/data.js` — el resto de la app no cambia.
