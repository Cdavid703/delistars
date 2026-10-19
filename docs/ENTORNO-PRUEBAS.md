# Entorno de pruebas

Copia completa de DeliStars para construir y probar sin tocar pedidos, saldos,
premios ni cuadres reales (especificación §22.1). Creado el 18 de octubre de 2026.

| | Producción | Pruebas |
|---|---|---|
| Dirección | https://delistars.com | https://pruebas.delistars.com |
| Rama de git | `integracion-admin` | `pruebas` |
| Carpeta en el VPS | `/opt/delistars` | `/opt/delistars-pruebas` |
| Proyecto Firebase | `delistars-domicilios` | `delistars-pruebas` |
| Contenedores | `delistars_*` | `delistars_pruebas_*` (proyecto compose `delistars-pruebas`) |
| Puertos internos | backend 3001, gateway 8090 | backend 3012, gateway 8191 |
| Base de datos | volumen de producción | volumen propio; catálogo copiado de producción el 18 oct |
| Despliegue automático | `/opt/delistars/auto-deploy.sh` (`delistars-deploy.timer`) | `/usr/local/bin/delistars-pruebas-deploy.sh` (`delistars-pruebas-deploy.timer`), cada 2 min |
| Credencial del servidor | `/opt/delistars/secrets/firestore-backup-key.json` | `/opt/delistars-pruebas-secrets/firestore-key.json` (cuenta `servidor-pruebas@delistars-pruebas`) |
| Correo de campañas | marketing@delistars.com | **apagado** (sin `SMTP_PASS`): pruebas nunca escribe a clientes reales |

## Cómo se usa

- Publicar en pruebas: `git push origin <rama>:pruebas` (se puede forzar; el
  servidor toma la rama tal cual está en GitHub). En unos minutos queda en
  pruebas.delistars.com. Bitácora: `/opt/delistars-pruebas/deploy.log`.
- Desplegar a mano: `ssh root@177.7.52.161 /usr/local/bin/delistars-pruebas-deploy.sh --forzar`.
- El script genera `docker-compose.pruebas.gen.yml` a partir del `docker-compose.yml`
  de producción (cambia nombres, puertos y llaves). No hay que mantener dos archivos.
- Después de cada despliegue reinicia el gateway (los contenedores recreados cambian
  de IP y nginx se quedaba con la vieja: daba 502). El scheduler solo se levanta si
  `.env` tiene `AUTO_OPEN_BOT_PASSWORD`; si no, queda detenido.
- Reglas de Firestore en pruebas:
  `firebase deploy --only firestore:rules --project delistars-pruebas`
  (**siempre** con `--project`: el proyecto por defecto del repo es producción).

## Pendiente para que quede completo

1. ~~DNS y HTTPS~~: hecho el 18 oct 2026 (registro A `pruebas` → `177.7.52.161`,
   certificado de Let's Encrypt que se renueva solo con `certbot.timer`).
2. ~~Inicio de sesión en Firebase de pruebas~~: hecho el 18 oct 2026. Google,
   correo/contraseña y anónimo habilitados; `pruebas.delistars.com` en dominios
   autorizados. Usuario bot `auto-open@delistars-domicilios.app` creado (su
   contraseña solo está en el `.env` del servidor) y scheduler de pruebas encendido.
3. **Storage** (comprobantes e imágenes): requiere el plan Blaze en el proyecto de
   pruebas. Sin él, pruebas funciona pero no se pueden subir archivos.
4. Disco del VPS: quedó en 88 % con las imágenes de pruebas. Vigilar.

## API de pedidos (Fase 3)

- `PEDIDOS_API=1` en el `.env` de pruebas y, desde el 19 oct 2026, también en producción.
  Producción usa la cuenta `servidor-pedidos@delistars-domicilios.iam.gserviceaccount.com`
  (rol Usuario de Cloud Datastore; llave en `/opt/delistars/secrets/servidor-pedidos.json`,
  elegida con `BACKEND_FIREBASE_KEY` en el `.env`).
- Usuario de prueba `prueba-api@delistars-pruebas.test` en Firebase de pruebas. Su
  contraseña solo está en `/opt/delistars-pruebas-secrets/usuario-prueba-api.json` (600).
- Prueba de punta a punta: `/opt/delistars-pruebas-secrets/prueba-api.js` (crea y mueve
  pedidos de prueba; le da y le quita el rol de caja y abre la sede una hora mientras corre).

