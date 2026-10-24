# Web actual vs. especificación de la app y portal web

Comparación entre la especificación `IOSAPP/delistars/ESPECIFICACION-APP-Y-PORTAL-WEB.md`
(v1.0, 6 de octubre de 2026) y el código en producción el 18 de octubre de 2026
(rama `integracion-admin`). Sirve para decidir qué preparar en la web antes de que
llegue la app de iPhone/iPad (y Android, que la especificación aún no aprueba).

> La carpeta `Projects/Delistars` está en un commit de septiembre. La comparación se
> hizo contra `Projects/Delistars-turnos` (lo que corre hoy en delistars.com).

## 1. Choques entre la especificación y lo que se decidió después

La especificación dice que manda «la corrección explícita más reciente del usuario».
Estas decisiones son **posteriores** al 6 de octubre y la contradicen. Hay que
confirmar cuál queda antes de construir encima.

| # | Tema | Especificación (6 oct) | Lo que está hoy en producción (decidido después) |
|---|---|---|---|
| C1 | Tarifa de domicilio | Tabla por barrio/cobertura/tarifa por sede | Cobro por recorrido real con Google Maps (9 oct), franjas de 1 km hasta 7 km |
| C2 | Campañas | Push de la app y franjas en app/web; **no** correo ni WhatsApp | Campañas por correo desde marketing@delistars.com (14 oct), con bajas |
| C3 | Datos que ve Mercadeo | Solo métricas agregadas; nada de datos personales | Mercadeo puede leer pedidos completos para Resumen y Reportes (10 oct) |
| C4 | Hora de llegada | No mostrar tiempo de preparación; solo ETA durante el reparto | "Te llega en ~40 min" en el checkout y hora estimada antes de salir |
| C5 | Ventanas emergentes | "Sin ventanas emergentes intrusivas" para promociones | PromoModal (popup de temporada) en la página principal |
| C6 | Compra como invitado | Prohibida: cuenta obligatoria antes de enviar | Se puede pedir como invitado (sesión anónima) y recuperar el pedido por teléfono |
| C7 | Abrir/cerrar la plataforma | Solo administración, con horarios por sede y excepciones | Caja y admin tienen el interruptor; el scheduler abre 5:30 p. m. y cierra 11:30 p. m. |
| C8 | Asignación | Automática al iniciar preparación, sin que el domiciliario acepte | Caja asigna y el domiciliario acepta o rechaza |

C6, C7 y C8 no son decisiones nuevas: son cosas que la web hace desde antes y que la
especificación cambia a propósito. C1 a C5 sí se decidieron después de la especificación.

### Decisiones tomadas (18 de octubre de 2026)

| # | Decisión |
|---|---|
| C1 | **Recorrido con Google.** Se mantiene el cobro actual por calle. Los barrios quedan solo como respaldo para agrupar rutas si falla Google (§11.3). |
| C2 | **Correo + push de la app.** Se mantiene el correo y se suman push y franja en el menú, con el límite de 1 promoción cada 24 h por cliente sumando canales. |
| C3 | **Solo números.** El servidor calcula los indicadores y Mercadeo pierde el acceso a los pedidos completos. |
| C4 | **Hora de llegada solo en camino.** Se quita el estimado del checkout y el de antes de salir. |
| C5 | **Franja en el menú.** Se reemplaza el popup de temporada. |
| C6 | **Cuenta obligatoria** antes de enviar. Los pedidos de caja sin cuenta usan enlace y código privado. |
| C7 | Admin define horarios por sede, excepciones y modo manual con duración. **Ajuste del 18 oct:** la caja también puede abrir o cerrar su sede por el resto del día (solo el modo manual; el horario sigue siendo de admin). La app debe ofrecer lo mismo a la caja. |
| C8 | **Asignación automática** al iniciar preparación, sin aceptación, máximo 5 en reparto, con turnos del domiciliario. |
| Servidor | Las reglas de negocio van en el **backend Express** del VPS. |
| Plataformas | La app será para **iOS y Android**. |
| Pruebas | Se crea un **entorno de pruebas** separado (otro proyecto Firebase y una copia del servidor). |

## 2. Lo que ya existe y se reutiliza

| Área | Estado hoy | Comentario |
|---|---|---|
| Menú, carrito, opciones (salsas, adiciones, presentaciones, bebidas de combo) | ✅ | Base del catálogo que la especificación pide conservar |
| Combos de promoción con fechas y unidades configurables | ✅ | `front/src/lib/promos.ts` |
| Pagos: Efectivo, Transferencia, Nequi, Mixto, comprobante imagen/PDF, cálculo de cambio | ✅ | Pago adelantado con importe conocido |
| Saldo a favor por sede, devoluciones con elección (saldo o transferencia) | ✅ parcial | Falta: autorización del monto por admin y uso parcial del saldo |
| Fidelización por sede (10 avances, 60 días, máx. 3) | ✅ | Hoy exige cuenta de Google: adaptar a cualquier proveedor |
| Direcciones guardadas con pin verificado (Google) | ✅ | Falta "favorita" |
| Cobertura/tarifa automática por recorrido, revisión del precio en servidor | ✅ | Ver choque C1 |
| Seguimiento con mapa y hora de llegada calculada al salir | ✅ parcial | La web no puede rastrear en segundo plano (la especificación lo acepta) |
| Chat cliente–caja | ✅ | Arreglo `clientMessages` dentro del pedido; solo texto. Desde el 24 oct 2026 hay además chat cliente–domiciliario en `orders/{id}/chat_domiciliario` (§8.3), los dos por `POST /pedidos/:id/mensajes` |
| Calificación | ✅ parcial | Una sola nota; la especificación pide comida y entrega por separado |
| Cuadre de efectivo del domiciliario | ✅ | Entregas parciales, fondos para cambio y diferencias para admin en pruebas (24 oct 2026) |
| Pedidos creados por caja | ✅ | Falta: enlace y código privado de recuperación |
| Notificaciones push web (FCM) para cliente y equipo | ✅ | Falta canal iOS (APNs) y centro de avisos |
| Panel admin: catálogo, sedes, domicilios, reportes, clientes, empleados, correo, turnos, vacantes | ✅ | Se conservan |
| Rol Mercadeo, calendario, campañas, audiencia, consentimiento de promociones | ✅ | Ver choques C2 y C3 |
| Login con Google, Microsoft, Apple y correo/contraseña | ✅ | Apple en producción (24 oct 2026) |
| Comanda imprimible desde caja | ✅ parcial | Imprime desde el navegador; no hay puente Windows ni estados de impresión |

## 3. Lo que falta, por sección de la especificación

Tamaño: **S** (días), **M** (1–2 semanas), **L** (varias semanas).

| § | Tema | Falta | Tamaño |
|---|---|---|---|
| 4 | Servicios compartidos | Hoy los navegadores escriben directo en Firestore con reglas. La especificación pide validar totales, transiciones, saldos y permisos en el servidor, con operaciones idempotentes, versión del pedido, auditoría y origen (web/app/caja). Es la base para que la app y la web no se pisen. | L |
| 6.1 | Identidad del cliente | Correo/contraseña con verificación, Apple, completar nombre/teléfono tras acceso social, vincular métodos de forma segura, cuenta obligatoria antes de enviar, eliminar cuenta | L |
| 6.2 | Pedidos de caja sin cuenta | Enlace privado + código de recuperación (reemplaza "recuperar con el teléfono"), vincular después a una cuenta | M |
| 6.3 | Equipo | Solicitud de acceso con aprobación del admin, selector de rol y sede, "Cambiar de empleado", "Mis sesiones", revocar sesiones | M |
| 7.1 | Sede y cobertura | Sugerir sede por ubicación al entrar, ofrecer la otra sede si la elegida no cubre (con diferencias del carrito) | S–M (parte hecha) |
| 7.2 | Carrito | Agotado **por sede** (hoy `disponible` es global), aviso de pedido activo antes de otro, lista de pedidos activos al volver | M |
| 7.3 | Pedido para otra persona | Destinatario, quién paga, enlace restringido del destinatario que vence a las 3 h | M |
| 8.1 | Estados | Pasar a 7 etapas (Enviado, Confirmado, En preparación, Listo, En camino, Llegó, Entregado) + flujo de recogida + excepciones. Hoy: pending, quoted, assigned, accepted, preparing, in_transit, arrived, delivered_*, completed… Requiere mapa de estados viejos → nuevos y migración. | L |
| 8.3 | Chats | Dos conversaciones separadas por pedido (cliente–caja y cliente–domiciliario), fotos y notas de voz, ventana de 3 h, caja sin acceso al chat del domiciliario | L |
| 9 | Cambios y cancelaciones | Cancelación por etapa, propuesta de cambio de productos con aceptación del cliente, cambio de dirección, "No puedo entregar" y devolución física | L |
| 10 | Caja | Pestañas por estado nuevas, un editor a la vez con "Tomar control", pedido presencial por catálogo, entrega en sede por número, agotar por sede, sin interruptor de plataforma | L |
| 11 | Domiciliarios | Turno (iniciar/pausar/finalizar), asignación automática al iniciar preparación, máximo 5 en reparto, agrupación ≤15 min, reasignación con motivo | L |
| 12 | Ubicación | Guardar recorridos solo de entregas, 7 días; frescura de la última ubicación (la captura en segundo plano es de la app) | M |
| 13 | Pagos y cuadres | Bloquear entrega con transferencia sin verificar, entregas parciales de efectivo, fondos para cambio con confirmación, diferencias a admin | M–L |
| 14 | Reclamos | Ficha de reclamo (Recibido → En revisión → Resuelto), calificación doble, autorización de reembolso por admin, saldo parcial. **Hecho 24 oct 2026** salvo fotos y saldo parcial | M–L |
| 16.2 | Horarios | Horarios por día y por sede con varios intervalos, excepciones por fecha, modo manual con duración (reemplaza el horario fijo del scheduler) | M |
| 16.3 | Reportes | Tiempos, demanda, clientes, domicilios, cancelaciones; exportar PDF/Excel | M |
| 17 | Mercadeo | Inicio/fin y pausa de campañas, cola con 1 promoción cada 24 h por cuenta, destinos (producto/categoría/premios), franja promocional, atribución de pedidos | M–L |
| 18 | Avisos | Centro de avisos (campana con leídos/pendientes) guardado en el servidor, sonido principal por sede, tokens iOS | M |
| 19 | Impresión | Cola de comandas en el servidor + puente en el PC Windows a la impresora USB, estados y copias | M (más el hardware) |
| 21 | Continuidad | Borradores sin conexión, revisión al reconectar, auditoría por pedido | M |
| 4.2 | Enlaces | Enlaces universales (web ↔ app) para promociones, seguimiento y recuperación | S |
| 5 | Diseño | Rediseño visual de web y app con modo claro/oscuro | L |

## 4. Qué preparar primero en la web (propuesta)

La app va a usar los mismos datos que la web. Si la app llega antes que estas bases,
cada regla queda escrita dos veces (web y app) y se desincronizan. Orden sugerido:

1. **Decidir los choques de la sección 1.** Bloquean pantallas y datos.
2. **Mapa de estados y modelo de pedido nuevo** (§8.1): estados, origen, versión,
   editor actual y auditoría. Con migración compatible de los pedidos existentes.
3. **Operaciones críticas en el servidor** (§4.2): crear pedido, transiciones, pagos,
   saldo y cuadre como funciones del backend (Express ya existe), con idempotencia.
   La web y la app las llaman igual; las reglas de Firestore dejan de permitir
   escrituras directas de esos campos.
4. **Identidad** (§6): correo/contraseña verificado, Apple, completar perfil,
   cuenta obligatoria, solicitud de acceso del equipo y selector de rol/sede.
5. **Horarios por sede y control solo de admin** (§16.2).
6. **Agotado por sede** (§7.2, §16.1).
7. **Centro de avisos y enlaces universales** (§18, §4.2): lo necesita la app desde
   el primer día.

Después: chats separados, cambios/cancelaciones, asignación automática, reclamos,
cuadres ampliados, impresión, reportes y Mercadeo según la especificación.

## 5. Pendientes de la especificación que se resolverán al llegar a cada parte

P-11 (**decidida 18 oct 2026**: recoger = Enviado → Confirmado → En preparación → Listo para recoger → Entregado; 6 excepciones: rechazado, cancelado, cancelación solicitada, cambio pendiente, no se pudo entregar, devuelto a la sede; mapeo de estados viejos en `src/utils/etapas.js`), P-13 (línea base comercial), P-14 (agotado por
sede), P-15 (identidades e invitados antiguos), P-16 (vigencia de los códigos
privados) y P-10 (tiempos configurables). Se preguntan uno a uno cuando toque.

**Decisiones del 20 oct 2026 (Fase 4):**
- **P-15:** la recuperación de pedidos solo con el teléfono se quita cuando entre la cuenta
  obligatoria. Los invitados no tenían premios ni saldo; un invitado con pedido en curso lo sigue
  viendo en su navegador y, si crea la cuenta ahí mismo, el pedido queda en su cuenta (vincular
  el anónimo, como ya hace Google). No se fusionan cuentas por correo o teléfono.
- **P-16:** el código privado de un pedido creado por la caja sirve mientras el pedido esté en curso
  y 30 días después de terminado; la caja puede generar uno nuevo (anula el anterior); 5 intentos
  fallidos lo bloquean un rato. El código no es el número del pedido.
- **P-25 (21 oct 2026):** eliminar la cuenta deja una solicitud de 30 días (puede arrepentirse; no puede
  pedir mientras tanto). El saldo a favor se le transfiere (la caja lo marca hecho). A los 30 días y sin
  pendientes, los pedidos quedan sin datos personales y se borran perfil, premios, saldo y acceso.
- **Apple:** la cuenta de Apple Developer quedó activa el 24 oct 2026 (Team ID `3BMCX522KW`). La web
  tiene «Continuar con Apple» (Services ID `com.delistars.web`, llave `QB6483CZC6`), activo en Firebase
  de pruebas y de producción desde el 24 oct 2026.

## 6. Plan de trabajo (después de las decisiones)

| Fase | Contenido | Depende de |
|---|---|---|
| 0 | Entorno de pruebas: proyecto Firebase de pruebas, base y servidor de pruebas en el VPS, despliegue automático desde una rama `pruebas` | Que crees el proyecto Firebase |
| 1 | Ajustes rápidos de las decisiones: C3 (indicadores agregados para Mercadeo), C4 (quitar estimados), C5 (franja en vez de popup), C7 (horarios por sede solo admin) | — |
| 2 | Modelo de pedido nuevo: 7 etapas + excepciones + recogida, origen, versión, editor, auditoría; mapa de estados viejos → nuevos | **Hecho 18 oct 2026** (`src/utils/etapas.js`, `actualizarPedido`) |
| 3 | API de operaciones del pedido en Express (crear, transiciones, pagos, saldo, cuadre) con idempotencia; reglas de Firestore cerradas a esas escrituras | **Activa en producción (19 oct 2026):** crear, transiciones, pago, código/premios/saldo, combos de promoción y datos de transferencia (`modulo_pedidos`, cuenta `servidor-pedidos`). Caja y domiciliarios ya mueven pedidos por la API (con respaldo directo). Reglas: cliente y domiciliario solo escriben los campos de su pantalla (19 oct). Pedidos del cliente por la API y reglas cerradas a crear, pagar, cancelar, saldo y premios: en producción (Fase 4, paso 2, 20 oct). Quedan directas solo las escrituras sin API todavía: agregar productos, chat, calificación y elegir la devolución |
| 4 | Identidad: correo/contraseña verificado, Apple, completar perfil, cuenta obligatoria (C6), código privado para pedidos de caja, solicitud de acceso del equipo, selector de rol/sede | P-15, P-16. **Hecho 19–20 oct:** solicitud de acceso del equipo con aprobación (Panel → Usuarios), rol y sedes por cuenta (`/api/v1/equipo/yo`); paso 1 (correo y contraseña verificado, Microsoft, completar perfil) en producción; paso 2 (cuenta obligatoria, la web crea, cancela y paga por la API, solicitud de cancelación que la caja aprueba o niega, reglas cerradas a esas escrituras, sin «recuperar con el teléfono») en producción (20 oct); paso 3 (código privado de los pedidos de caja: enlace + código, 30 días, 5 intentos, guardar en la cuenta) en producción (20 oct); paso 4 («Mi cuenta»: datos, formas de entrar, promociones y eliminar la cuenta con 30 días y anonimización, decisión P-25 del 21 oct) en pruebas. Paso 5 (Apple): botón en la web y en Mi cuenta, en producción (24 oct) |
| 5 | Domiciliarios: turnos y asignación automática (C8), máximo 5, reasignación | **En producción (22 oct 2026).** Decisiones: hay un solo domiciliario; se asigna al confirmar (no al iniciar preparación); si nadie está en turno, la caja decide. Turno iniciar/pausar/terminar, asignación sin aceptación, reasignación con motivo y máximo 5 en reparto. Quedan para cuando haya más domiciliarios: agrupación por 15 min, cercanía por GPS y regreso estimado |
| 6 | Avisos y enlaces: centro de avisos en el servidor, tokens push de iOS y Android, enlaces universales | **En producción (23 oct 2026).** Centro de avisos (`avisos/{destino}/items/{evento}`, campana en cliente, caja y domiciliario), avisos de chat/listo/sin domiciliario, push a la app por Expo (`/api/v1/avisos/dispositivo`), caja con aparato principal y «Visto» compartido, enlaces cortos `/p/<pedido>` y `/c/<código>`. `assetlinks.json` y `apple-app-site-association` los sirve el gateway (en producción desde el 24 oct 2026); la app agrega `associatedDomains` |
| 7 | Chats separados, cambios/cancelaciones, reclamos, cuadres ampliados, impresión, reportes y Mercadeo (push y franja) | **En curso.** Cambios y cancelaciones (§9) en producción (23 oct 2026): la caja propone un cambio antes de preparar y el cliente lo acepta o rechaza (`cambioPropuesto`, excepción `cambio_pendiente`, aviso si no responde); agregar productos por la API solo en Enviado; cancelación en reparto la decide administración. **Chats separados (§8.3) en producción (24 oct 2026):** `POST /pedidos/:id/mensajes { canal: caja | domiciliario, texto }`; el canal caja sigue en `clientMessages`, el del domiciliario en `orders/{id}/chat_domiciliario` (lo leen cliente, domiciliario asignado y admin; la caja no); abiertos hasta 3 h después de la entrega; avisos al otro lado desde el scheduler. Fotos y notas de voz quedan para después. **Reclamos y devoluciones (§14) en pruebas (24 oct 2026):** ficha `reclamos/{id}` (Recibido → En revisión → Solución propuesta → Resuelto, o cierre administrativo con motivo) por `/api/v1/reclamos`; la comida la atiende la caja, la entrega administración (ve todo); reembolso en tres pasos (caja solicita, admin autoriza, cliente elige saldo o transferencia); plazo 24 h tras la entrega; calificación doble comida/entrega. Pendiente: fotos, saldo parcial (§14.3). **Cuadres de efectivo (§13) en pruebas (24 oct 2026):** movimientos `cuadres/{id}` por `/api/v1/cuadres` (entrega del domiciliario que la caja confirma, con diferencia y motivo si no cuadra; fondo para cambio que el domiciliario acepta o rechaza diciendo cuánto recibió; la caja corrige dejando la corrección; administración resuelve diferencias con nota); «entregado» se bloquea con transferencia sin verificar (409 `transferencia_pendiente`). Siguen: impresión, reportes, Mercadeo |
