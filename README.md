# 🍔 AutoPedido 2.0 (Eatsy)

Sistema de autopedido para locales gastronómicos: **kiosco de autoservicio táctil**, **caja**, **cocina**, **pantalla pública de llamados** y **panel de administración**, todo sincronizado en tiempo real.

Migración completa del proyecto Laravel original a:

| Capa | Tecnología |
|---|---|
| Frontend | HTML5, CSS3, JavaScript (módulos ES nativos), Bootstrap 5, Bootstrap Icons, SweetAlert2, Chart.js, JsBarcode |
| Backend | Node.js + Express 5 |
| Base de datos | MySQL / MariaDB (driver `mysql2`) |
| Tiempo real | **WebSocket implementado a mano** sobre el módulo `http` de Node (RFC 6455, sin librerías) |

Todas las dependencias son gratuitas y de código abierto. Las librerías del frontend se sirven desde `node_modules`, así que **funciona sin internet** dentro del local (solo la tipografía Poppins viene de Google Fonts, con fuente de respaldo).

---

## 🚀 Puesta en marcha

Requisitos: **Node.js 22.13+** y **MySQL 8 / MariaDB 10.4+** (por ejemplo, el de XAMPP).

```bash
# 1) Instalar dependencias
npm install

# 2) Configuración (si no existe .env). Por defecto usa root sin contraseña en 127.0.0.1:3306
cp .env.example .env

# 3) Levantar MySQL (XAMPP → Start MySQL) y arrancar la app
npm start
```

La primera vez se crea la base `autopedido`, las tablas y los datos iniciales automáticamente.
Abrí **http://localhost:3000**.

Comandos útiles:

| Comando | Qué hace |
|---|---|
| `npm start` | Inicia el servidor (HTTP + WebSocket en el mismo puerto) |
| `npm run dev` | Igual, pero se reinicia solo al cambiar archivos del backend |
| `npm run db:reset` | Borra y recrea todas las tablas según `APP_MODE` |
| `npm run db:demo` | Agrega pedidos de ejemplo de los últimos 14 días (solo modo demo) |
| `npm test` | Tests automáticos (protocolo WebSocket, precios, tokens, validación) |

### Modo demo y modo producción

La variable `APP_MODE` decide qué pasa **la primera vez** que la app encuentra la base vacía:

| `APP_MODE` | Qué carga | Para qué |
|---|---|---|
| `demo` (por defecto) | 25 productos con fotos, categorías, ingredientes, promociones, clientes, reglas de puntos y usuarios de prueba. El login muestra los usuarios de prueba. | Probar, mostrar, desarrollar |
| `produccion` | **Todas las tablas vacías** y un único administrador (`ADMIN_USER` / `ADMIN_PASSWORD`). Si no definís la contraseña, se genera una al azar y se muestra **una sola vez** en los logs. | El local real |

Después del primer arranque el modo ya no borra ni agrega nada: cambiar `APP_MODE` en una base con datos no los toca. Para empezar de cero: `npm run db:reset` (en producción pide `npm run db:reset -- --confirmar`).

### Usuarios de prueba — solo modo demo (contraseña `123456789`)

| Usuario | Rol | Pantalla |
|---|---|---|
| `Admin` | Administrador | `/admin` |
| `Cajero1`, `Cajero2` | Cajero | `/caja` |
| `Cocina1`, `Cocina2` | Cocina | `/cocina` |
| `Kiosco1` | Cliente (autoservicio) | `/kiosco` |

- **Pantalla de llamados** (pública, para un TV): `http://localhost:3000/llamados` — muestra un **QR** para que los clientes sigan su pedido desde el celular.
- **Seguimiento desde el celular**: `http://IP-DEL-SERVIDOR:3000/seguimiento` (ver más abajo).
- **Salir del kiosco:** tocar 5 veces seguidas el logo e ingresar el PIN (`KIOSCO_PIN`, por defecto `4500`).

> 💡 Para probar varios roles a la vez en el mismo navegador usá `localhost:3000` para uno y `127.0.0.1:3000` para otro (las cookies son independientes), o una ventana de incógnito.

---

## ☁️ Desplegar en Render

Render no ofrece MySQL, así que la base va en un proveedor aparte. Opción gratuita recomendada: **[Aiven for MySQL](https://aiven.io/mysql)** (plan *Free*, MySQL 8 real).

1. **Base de datos**: creá el servicio MySQL en Aiven y copiá su *Service URI* (`mysql://avnadmin:CLAVE@HOST:PUERTO/defaultdb?ssl-mode=REQUIRED`).
2. **Web**: en Render → *New → Blueprint* → elegí este repositorio. Toma la configuración de [`render.yaml`](render.yaml).
3. Completá las variables que pide:
   - `DATABASE_URL` → la URI del paso 1 (el SSL se activa solo).
   - `APP_MODE` → `demo` para mostrarlo con datos de prueba, o `produccion` para el local real.
   - `ADMIN_PASSWORD` → contraseña del administrador (solo modo producción).
   - `KIOSCO_PIN` → PIN para salir del kiosco.
4. Deploy. Las tablas se crean solas. La URL de Render se usa automáticamente en el QR de seguimiento (`RENDER_EXTERNAL_URL`).

Tené en cuenta:
- **Plan gratuito**: el servicio se “duerme” tras 15 minutos sin tráfico y tarda ~1 minuto en despertar. Para evitarlo, creá un cron en **[cron-job.org](https://console.cron-job.org/dashboard)** que haga `GET https://TU-APP.onrender.com/api/health` **cada 10 minutos** (responde `{"ok":true}` al instante, sin tocar la base de datos).
- **Imágenes subidas desde el panel**: el disco de Render se borra en cada deploy/reinicio, así que las fotos subidas como archivo se pierden. Usá el campo **URL de la imagen** (por ejemplo, fotos alojadas en Cloudinary o Imgur) o agregá un *Render Disk* montado en `uploads/` (plan pago). Las fotos de los productos de demo vienen en el repositorio y no se pierden.
- `SESSION_SECRET` lo genera Render solo; `TRUST_PROXY=1` y `NODE_ENV=production` ya vienen en el blueprint (cookies seguras por HTTPS).
- Rutas de salud: `/api/health` (ping liviano para el cron) y `/api/salud` (además verifica la conexión a MySQL; la usa Render como *health check*).

---

## 🍔 Extras, cupones y teclado táctil

- **Extras de ingredientes**: en *Admin → Ingredientes* cada ingrediente puede tener un **precio como extra** (vacío = no se ofrece, 0 = gratis). En el kiosco y en la caja, al elegir un producto se puede pedir hasta **3 unidades extra** de los ingredientes que ese producto ya lleva (ej. 2 carnes más en la hamburguesa). Se cobran aparte de la promoción y se ven en caja, cocina, tickets y seguimiento.
- **Promociones**:
  - *Sin código* → se aplican solas (porcentaje o monto por unidad).
  - *Con código* (solo **monto fijo**) → son **cupones**: el cliente lo ingresa en el kiosco o el cajero en la caja, y se descuenta el monto del **total** del pedido si incluye algún producto de la promoción (nunca más que lo que suman esos productos).
  - Botón **“Agregar todos”** para incluir todos los productos de una vez.
- **Teclado en pantalla** en el kiosco: al tocar el buscador o el campo del cupón aparece un teclado propio desde abajo (sin el teclado del sistema), que deja ver los resultados mientras se escribe.

---

## 📱 Seguimiento del pedido desde el celular

1. El cliente escanea el **QR de la pantalla de llamados** (apunta a `http://<IP-de-la-PC>:3000/seguimiento`).
2. Ingresa el **código de su ticket** (`PED-XXXX`, también acepta solo `XXXX`). Si el pedido se hizo en caja con su **cédula** (para sumar puntos), también se la pide.
3. Ve el estado en vivo: *Recibido → En preparación → ¡Listo! → Entregado*. Cuando está listo **suena el mismo sonido de pedido nuevo**, vibra y la pantalla se pone verde.

Seguridad:
- El celular recibe un token firmado (cookie `httpOnly`, 12 h) que **solo permite ver ese pedido**: por WebSocket le llegan únicamente los cambios de su pedido.
- Mientras sigue un pedido, **no puede abrir ninguna otra sección** (login, caja, llamados, etc.): el servidor lo devuelve a `/seguimiento` y la API le responde 403.
- Máximo 10 intentos fallidos por IP cada 10 minutos (no se pueden “adivinar” códigos).

Requisitos de red:
- El celular tiene que estar en la **misma red Wi-Fi** que la PC del servidor, y el **Firewall de Windows** debe permitir Node.js en el puerto 3000 (Windows lo pregunta la primera vez; elegí “Redes privadas”).
- La IP se detecta sola y se muestra debajo del QR. Si no es la correcta (p. ej. hay varias placas de red), fijala en `.env` con `PUBLIC_URL=http://192.168.1.20:3000`.
- Las **notificaciones del sistema** y mantener la pantalla encendida solo los permiten los navegadores en **HTTPS**. En la red local (HTTP) el aviso es con sonido, vibración y la pantalla de estado; si publicás la app con HTTPS se activan solas.

---

## 🔄 Flujo de un pedido

```
Kiosco / Caja ──crea──▶ Recibido ──caja "Cocina"──▶ En Preparación ──cocina "Listo"──▶ Listo ──caja "Entregar"──▶ Entregado
                                                                                       │                          │
                                                                          aparece en /llamados          suma puntos al cliente
```

Cada cambio se envía por WebSocket a las pantallas que lo necesitan:

| Evento | Caja / Admin | Cocina | Llamados (público) | Kiosco |
|---|---|---|---|---|
| `pedido:creado` | ✔ (sonido + fila nueva) | | | |
| `pedido:estado` | ✔ | ✔ (agrega / quita tarjetas) | ✔ datos mínimos, cédula enmascarada | |
| `pedido:actualizado` | ✔ | ✔ (“MODIFICADO”) | ✔ | |
| `pago:estado` | ✔ | | | |
| `catalogo:actualizado` | ✔ | | | ✔ recarga el menú |

Además, el celular que sigue un pedido recibe `pedido:estado` y `pedido:actualizado` **solo de su pedido**.

---

## 🗂️ Estructura

```
AutoPedido2.0/
├── server.js                  # Arranque: DB → Express → WebSocket
├── src/
│   ├── app.js                 # Configuración de Express (estáticos, API, páginas, errores)
│   ├── config/                # Variables de entorno (process.loadEnvFile nativo)
│   ├── db/                    # Pool MySQL, transacciones, schema.sql, seeders y CLI
│   ├── repositories/          # Acceso a datos (SQL)
│   ├── services/              # Reglas de negocio (pedidos, precios, puntos, estadísticas...)
│   ├── controllers/           # Capa HTTP + validación de entrada
│   ├── routes/                # /api/* y páginas con control de rol
│   ├── middlewares/           # Sesión, roles, CSRF, cabeceras, subida de imágenes, errores
│   ├── utils/                 # Validador, tokens HMAC, scrypt, fechas, errores HTTP
│   └── websocket/
│       ├── protocol.js        # Frames RFC 6455 (codificar / parsear)
│       ├── connection.js      # Una conexión: fragmentos, ping/pong, cierre
│       ├── server.js          # Handshake, heartbeat, broadcast
│       └── realtime.js        # Qué evento recibe cada rol
├── public/
│   ├── css/                   # base + un CSS por pantalla
│   ├── js/
│   │   ├── core/              # api, ui, realtime (cliente WS con reconexión), layout, sonido, ticket
│   │   ├── admin/ caja/ cocina/ kiosco/ llamados/ auth/
│   ├── admin/ caja/ cocina/ kiosco/ llamados/   # Páginas HTML
│   └── img/ sounds/
├── uploads/                   # Imágenes subidas desde el panel
└── tests/                     # node:test
```

---

## ✨ Mejoras respecto a la versión Laravel

**Funcionales**
- Promociones con **porcentaje o monto fijo** (antes un “descuento 300” se aplicaba como 300 %) y nunca dejan precio negativo; se aplican igual en **kiosco y caja** (antes la caja las ignoraba) y se muestran con precio tachado.
- El detalle del pedido guarda **precio unitario y descuento** (historial fiel aunque cambien los precios).
- Pantalla de llamados con columnas **“Preparando” / “¡Listos!”**, sonido, y los pedidos entregados desaparecen solos.
- Cocina con **cronómetro y colores por demora**, aviso de pedidos **modificados** y orden configurable.
- Caja: contadores por estado, búsqueda por código/cédula/nombre compatible con **lector de código de barras**, opción “enviar a cocina al confirmar”, al entregar ofrece **marcar el pago como completado**.
- Reglas de puntos **sin tramos superpuestos** y con simulador.
- Estadísticas con KPIs (ticket promedio, efectivo/tarjeta, kiosco/caja), días/horas sin ventas en 0 y **exportación a PDF** (vista imprimible).
- Kiosco: carrito persistente, limpieza por **inactividad**, ticket imprimible con código de barras, el menú se actualiza solo cuando el admin cambia algo.
- No se puede editar un pedido entregado/cancelado, ni deshabilitar al último administrador o a uno mismo.

**Técnicas / seguridad**
- Contraseñas con **scrypt** y sesión en cookie `httpOnly` firmada con HMAC; un usuario deshabilitado pierde el acceso al instante.
- Protección **CSRF** (cabecera obligatoria + SameSite), validación de `Origin` en WebSocket, límite de intentos de login, cabeceras de seguridad, escape de HTML en todo el frontend.
- El **PIN del kiosco** se valida en el servidor (antes estaba escrito en el JavaScript).
- La pantalla pública solo recibe la **cédula enmascarada**.
- Transacciones en la creación/edición de pedidos y en la entrega con puntos.
- Búsquedas sin distinguir mayúsculas ni tildes (`utf8mb4_unicode_ci`).

---

## 🔌 API (resumen)

Todas las rutas que modifican datos requieren la cabecera `X-Requested-With: fetch`.

| Método | Ruta | Rol |
|---|---|---|
| POST | `/api/auth/login` · `/api/auth/logout` · GET `/api/auth/me` | — |
| GET | `/api/catalogo/categorias` · `/api/catalogo/productos` · `/api/catalogo/productos/:id` | Kiosco, Cajero |
| POST | `/api/catalogo/cupon` (validar un código de descuento) | Kiosco, Cajero |
| POST | `/api/kiosco/pedidos` | Kiosco |
| GET/POST/PUT | `/api/caja/pedidos[/:id]` · PATCH `/:id/estado` · PATCH `/:id/pago` | Cajero |
| GET/POST/PUT | `/api/caja/clientes` · `/api/caja/clientes/cedula/:cedula` | Cajero |
| GET · PATCH | `/api/cocina/pedidos` · `/api/cocina/pedidos/:id/listo` | Cocina |
| GET | `/api/publico/llamados` · `/api/publico/seguimiento-qr` | público |
| POST · GET · DELETE | `/api/seguimiento` (identificarse con código/cédula, ver estado, dejar de seguir) | celular del cliente |
| CRUD | `/api/admin/{categorias,ingredientes,usuarios,productos,promociones}` (+ `/:id/habilitar`, `/:id/deshabilitar`) | Admin |
| CRUD | `/api/admin/reglas-puntos` · GET `/api/admin/estadisticas` | Admin |

WebSocket: `ws://HOST:PORT/ws` (autenticado con la misma cookie de sesión; sin sesión = canal público).

---

👨‍💻 Desarrollado por estudiantes del Tecnólogo Informático – Sede Paysandú: **Alan Ceballos – Jairo Bandera**
