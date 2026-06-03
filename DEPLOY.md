# Despliegue DeliStars

## Servidor
- IP: `177.7.52.161` — nginx, Debian
- SSH: `root@177.7.52.161` con clave `~/.ssh/id_ed25519`
- Web root: `/var/www/delistars.com/`
- **NO tocar:** `/var/www/jaralingua.com/`

## Desarrollo local

```bash
npm run dev               # domicilios → localhost:5173
npm run dev:vacantes      # vacantes  → localhost:5173/vacantes/
```

## Build

```bash
npm run build             # → dist/
npm run build:vacantes    # → dist-vacantes/
npm run build:turnos      # → dist-turnos/
```

## Subir al servidor

```powershell
# Domicilios
scp -i ~/.ssh/id_ed25519 -r dist/* root@177.7.52.161:/var/www/delistars.com/dist/

# Vacantes
scp -i ~/.ssh/id_ed25519 -r dist-vacantes/* root@177.7.52.161:/var/www/delistars.com/dist-vacantes/

# Turnos
scp -i ~/.ssh/id_ed25519 -r dist-turnos/* root@177.7.52.161:/var/www/delistars.com/dist-turnos/
```

Si da error de permisos después del SCP (desde el SSH del servidor):
```bash
chmod -R 755 /var/www/delistars.com/dist/
chmod -R 755 /var/www/delistars.com/dist-vacantes/
chmod -R 755 /var/www/delistars.com/dist-turnos/
```

## Firebase — proyecto `delistars-domicilios`
- Admins: `thebesta4321@gmail.com`, `cdavid.jaramillo@gmail.com`
- Colecciones Firestore: `orders`, `roles_cashiers`, `roles_drivers`, `config`, `vacantes_postulantes`
- Storage: carpeta `cvs/` para hojas de vida
