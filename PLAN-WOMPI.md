# Plan de implementación — Pago con Wompi

> **Estado:** EN DESARROLLO (fase local). Fase 2 (producción) queda descrita
> al final pero NO se ejecuta hasta aprobarla por separado.

## ⚠️ Decisión: desarrollo SIN cuenta Wompi (2026-07-05)

Aún no existe cuenta/comercio en Wompi. **No bloquea el desarrollo**: se
construye todo (backend, cliente, caja, admin) y se prueba con un **modo
simulado** integrado. La cuenta queda de último, solo para la prueba final.

- El backend arranca en **modo simulado** cuando no hay llaves configuradas
  (`WOMPI_PUBLIC_KEY` vacío o `WOMPI_SIMULATED=true`).
- En modo simulado, en vez de redirigir al checkout real, el cliente ve un
  **simulador de pago** (solo desarrollo) con botones "Aprobar" / "Rechazar"
  que recorre exactamente el mismo camino de código: sesión → "pago" →
  verificación → pedido marcado pagado → sello verificado en caja.
- Cuando se cree la cuenta Wompi (gratis, en comercios.wompi.co): se pegan
  las llaves de sandbox en el `.env` del backend y el MISMO código pasa a
  usar el checkout real de prueba, sin cambiar una línea. Después, para
  producción, solo se cambian por las llaves productivas (fase 2).

**Lo único imposible sin cuenta:** validar contra los servidores reales de
Wompi (checkout real, tarjetas de prueba, latencias de PSE). Todo lo demás
—flujo, UI, seguridad del monto, verificación de caja, cuadre— queda hecho
y probado con el simulador.

---

## 1. Objetivo y regla de negocio

Agregar **Wompi** (pasarela de Bancolombia: tarjetas, PSE, Nequi, botón
Bancolombia) como alternativa de pago **del pedido completo (productos +
domicilio)**, manteniendo la regla de negocio actual:

> El cliente **no paga hasta que la caja cotice el domicilio**. El pago con
> Wompi aparece como opción **después de recibir la cotización**, cuando el
> total exacto ya se conoce.

Flujo resultante:

```
Cliente arma pedido ──► Caja cotiza (agrega domicilio) ──► Cliente ve total
                                                              │
                                            elige método de pago:
                                            Efectivo / Transferencia / Nequi /
                                            Mixto / ⭐ WOMPI (nuevo)
                                                              │
                                          [Wompi] abre checkout oficial de Wompi
                                          paga con tarjeta / PSE / Nequi / etc.
                                                              │
                                          Wompi confirma (APROBADO) ──► el pedido
                                          queda marcado PAGADO ✓ y el cliente
                                          sigue su seguimiento normal
                                                              │
                            La caja ve el pedido con sello "PAGADO CON WOMPI ✓
                            (verificado)" ──► solo le queda asignar domiciliario.
                            Sin manejo de efectivo, sin comprobantes manuales.
```

Wompi **convive** con los métodos actuales (no reemplaza a
Transferencia/Nequi manual — esos siguen para quien los prefiera).

---

## 2. Cómo funciona Wompi (lo que usaremos)

- **Web Checkout (redirect):** se envía al cliente a
  `https://checkout.wompi.co/p/` con: llave pública, monto **en centavos**
  (COP), referencia única (usaremos el ID del pedido), URL de retorno y una
  **firma de integridad** = SHA-256 de `referencia + monto + moneda + secreto
  de integridad`. La firma evita que alguien altere el monto.
- **El secreto de integridad NUNCA puede ir en el frontend** → la firma se
  genera en nuestro backend Express.
- **Sandbox:** `sandbox.wompi.co` con llaves de prueba (`pub_test_…`,
  `prv_test_…`) y tarjetas de prueba (ej. `4242 4242 4242 4242` aprueba,
  otra rechaza). Perfecto para la fase local: **no se mueve dinero real**.
- **Verificación:** el estado real de una transacción se consulta en la API
  de Wompi (`GET /v1/transactions/{id}`). La palabra final SIEMPRE la da esa
  consulta, nunca lo que diga el navegador del cliente.

---

## 3. Arquitectura (fase local)

### 3.1 Backend (`delistars-menu-magic/back`) — 2 endpoints nuevos

Módulo nuevo `modulo_payments`:

| Endpoint | Qué hace | Protección |
|---|---|---|
| `POST /api/v1/payments/wompi/session` | Recibe `{ orderId, amountInCents }`, genera `reference` y la **firma de integridad** con `WOMPI_INTEGRITY_SECRET`, devuelve los parámetros del checkout | Firebase ID token (cualquier usuario firmado — igual que el resto del flujo del cliente) |
| `GET /api/v1/payments/wompi/verify/:transactionId` | Consulta la transacción directo a la API de Wompi y devuelve `{ status, amountInCents, reference }` | Firebase ID token |

- El backend ya tiene `firebase-admin` para validar tokens (lo usa
  `require-admin`) → se reutiliza un middleware `require-signed-in` más laxo.
- Variables nuevas en `.env` (solo sandbox por ahora):
  `WOMPI_API_URL=https://sandbox.wompi.co/v1`,
  `WOMPI_PUBLIC_KEY=pub_test_…`, `WOMPI_INTEGRITY_SECRET=test_integrity_…`.

### 3.2 Cliente (`src/` — app de domicilios)

En `ClientOrderDetail` (donde hoy elige método tras la cotización):

1. Nueva opción **"Wompi (tarjeta, PSE, Nequi)"** en el selector de pago.
2. Al elegirla: llama `POST /payments/wompi/session` → redirige al checkout
   de Wompi con el **total cotizado exacto** (productos + domicilio).
3. Wompi regresa al cliente a `/domicilios/?wompi_id=<transactionId>` →
   la app llama `GET /payments/wompi/verify/<id>`:
   - **APPROVED** → actualiza el pedido: `payment: 'Wompi'`,
     `cashOnDelivery: false`, `wompi: { transactionId, status: 'APPROVED',
     amountInCents, approvedAt }` → el cliente ve "✅ Pago confirmado" y sigue
     su seguimiento normal.
   - **DECLINED / ERROR / VOIDED** → aviso claro + puede reintentar o elegir
     otro método. El pedido NO queda marcado pagado.
   - **PENDING** (ej. PSE tarda) → pantalla "verificando pago…" que reintenta
     la verificación unos segundos.
4. El borrador/estado del pedido sobrevive la ida y vuelta del redirect
   (misma técnica que ya usamos para el carrito).

### 3.3 Caja (`CashierPanel` / `OrderDetail`)

- Pedido con `payment === 'Wompi'`: sello grande **"💳 PAGADO CON WOMPI"**.
- **Verificación independiente**: al abrir el detalle, la caja llama al mismo
  `GET /payments/wompi/verify/<id>` y muestra "✓ verificado con Wompi
  (monto $X)" — la caja NUNCA confía en lo que escribió el navegador del
  cliente; confía en la respuesta de Wompi. Si el monto verificado ≠ total
  del pedido, alerta roja.
- Se ocultan las secciones de efectivo/comprobante para estos pedidos.
- El ticket de impresión dice "PAGADO — WOMPI".

### 3.4 Admin

- `PAYMENT_OPTIONS` += 'Wompi' (editor de pedidos).
- Cuadre de caja: Wompi cuenta como **digital** (como Transferencia/Nequi).
- Reportes/Excel: aparece como método de pago normal.

---

## 4. Modelo de datos (campos nuevos en `orders`)

```
payment: 'Wompi'
cashOnDelivery: false
wompi: {
  transactionId: 'xxxx-xxxx',   // id de Wompi
  reference:     '<orderId>',   // nuestra referencia
  status:        'APPROVED',    // estado verificado contra la API
  amountInCents: 4550000,       // lo realmente pagado
  approvedAt:    <timestamp>,
}
```

Reglas de Firestore: **no requieren cambios** (el cliente ya puede actualizar
su propio pedido; la caja ya puede leer/actualizar todos).

---

## 5. Seguridad — por qué este diseño es confiable

1. **Monto inalterable:** la firma de integridad se genera en el backend con
   el total cotizado leído del pedido; si alguien manipula el monto en el
   navegador, Wompi rechaza el checkout.
2. **La caja verifica contra Wompi, no contra el cliente:** aunque un cliente
   técnico escribiera `payment: 'Wompi'` a mano en su pedido, la caja ve
   "⚠️ sin verificación de Wompi" porque la consulta a la API no encuentra
   transacción aprobada con esa referencia y ese monto.
3. **Secretos solo en el backend** (`.env`, nunca en bundles de Vite).
4. Fase 2 añade el webhook firmado de Wompi como confirmación de servidor a
   servidor (cinturón y tirantes).

---

## 6. Plan de pruebas (todo local, sandbox)

1. Levantar backend local (`npm run dev` en `back/`) con llaves sandbox.
2. Levantar app domicilios local (puerto 5173) y menú (5174).
   - ⚠️ Requiere agregar `localhost` a los dominios autorizados de Firebase
     Auth (pendiente conocido — lo haces tú en la consola, 1 minuto).
3. Crear pedido de prueba → cotizar desde la caja → elegir Wompi → pagar con
   tarjeta de prueba `4242…` → verificar que:
   - el pedido queda `payment: 'Wompi'` con `wompi.status: 'APPROVED'`,
   - la caja ve el sello verificado y el monto correcto,
   - una tarjeta que rechaza NO marca el pedido como pagado,
   - el cuadre de caja lo suma como digital.
4. Probar manipulación: cambiar el monto a mano en la URL del checkout →
   Wompi debe rechazar por firma inválida.

---

## 7. Fase 2 — producción (NO incluida ahora, requiere aprobación aparte)

- Crear/activar el comercio real en Wompi (tus llaves `pub_prod_…` — proceso
  del negocio con Bancolombia, tarifas ~2.65% + IVA por transacción, a
  confirmar con Wompi).
- Cambiar env a producción (`production.wompi.co`) en el `.env` del VPS.
- **Webhook** `POST /payments/wompi/webhook` (URL pública) con verificación
  de firma (`WOMPI_EVENTS_SECRET`): confirmación servidor-a-servidor incluso
  si el cliente cierra el navegador tras pagar. Requiere decidir cómo escribe
  el backend en Firestore (service account de Firebase — conversación aparte
  de seguridad).
- Deploy normal (backend + domicilios + admin) y prueba con un pago real
  pequeño.

---

## 8. Lo que necesito de ti antes de empezar a codificar

1. **Cuenta Wompi:** ¿ya tienes comercio creado en Wompi? Para la fase local
   solo necesito las **llaves del ambiente de pruebas (sandbox)**: llave
   pública `pub_test_…` y el **secreto de integridad** de prueba. Se ven en
   comercios.wompi.co → Desarrolladores. (Si aún no hay cuenta, se puede
   crear gratis y el sandbox funciona de inmediato.)
2. **Confirmar la regla:** Wompi aparece **después de la cotización** (igual
   que los demás métodos). ¿Correcto?
3. **Pedidos "recoger en sede":** ¿también pueden pagar con Wompi una vez la
   caja confirma el pedido? (Propongo que sí.)
