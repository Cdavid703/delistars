# DeliStars — Guía de Diseño Visual

Documento de referencia con todos los colores, tipografías y estilos visuales usados en el front-end.

---

## Paleta de Colores

Los colores están definidos como variables CSS en `src/index.css` y registrados en `tailwind.config.ts`.

### Colores principales

| Nombre | Clase Tailwind | Hex | HSL | Uso |
|--------|---------------|-----|-----|-----|
| Cherry | `bg-cherry` / `text-cherry` | `#EA3329` | `hsl(3 82% 54%)` | Color primario, botones CTA, acentos |
| Tangelo | `bg-tangelo` / `text-tangelo` | `#ED5B3E` | `hsl(9 84% 59%)` | Acento secundario, efectos glow |
| Mustard | `bg-mustard` / `text-mustard` | `#E88F00` | `hsl(37 100% 46%)` | Acento cálido, highlight |
| Pepper | `bg-pepper` / `text-pepper` | `#CC3300` | `hsl(12 100% 40%)` | Acciones destructivas / errores |
| Mint | `bg-mint` / `text-mint` | `#189386` | `hsl(173 72% 34%)` | Disponible, no usado activamente |
| Cream | `bg-cream` / `text-cream` | `#F4E7D0` | `hsl(36 60% 88%)` | Fondo principal, texto sobre oscuro |
| Smoked | `bg-cream-deep` | `#EDEAE6` | `hsl(36 16% 92%)` | Fondo secundario, secciones |
| Coal | `bg-coal` / `text-coal` | `#262626` | `hsl(0 0% 15%)` | Texto oscuro, fondos footer |

### Tokens semánticos (variables CSS)

Estos son los nombres que se usan en los componentes con clases como `bg-primary`, `text-foreground`, etc.

| Token | Variable CSS | Valor por defecto |
|-------|-------------|-------------------|
| `background` | `--background` | Cream `hsl(36 60% 88%)` |
| `foreground` | `--foreground` | Coal `hsl(0 0% 15%)` |
| `primary` | `--primary` | Cherry `hsl(3 82% 54%)` |
| `primary-foreground` | `--primary-foreground` | Cream claro `hsl(36 60% 94%)` |
| `primary-glow` | `--primary-glow` | Tangelo `hsl(9 84% 59%)` |
| `secondary` | `--secondary` | Smoked `hsl(36 16% 92%)` |
| `secondary-foreground` | `--secondary-foreground` | Coal |
| `accent` | `--accent` | Mustard `hsl(37 100% 46%)` |
| `accent-foreground` | `--accent-foreground` | Coal |
| `muted` | `--muted` | Cream tenue `hsl(36 30% 90%)` |
| `muted-foreground` | `--muted-foreground` | Gris oscuro `hsl(0 0% 30%)` |
| `card` | `--card` | Cream suave `hsl(36 60% 94%)` |
| `destructive` | `--destructive` | Pepper `hsl(12 100% 40%)` |
| `border` | `--border` | `hsl(36 20% 80%)` |
| `input` | `--input` | `hsl(36 25% 86%)` |
| `ring` | `--ring` | Cherry (igual que primary) |

### Transparencias frecuentes

Tailwind permite agregar opacidad con `/` al final. Los valores más usados en el proyecto:

```
bg-primary/10   →  Cherry al 10% de opacidad (fondo sutil)
bg-primary/30   →  Cherry al 30%
text-cream/60   →  Cream al 60% (texto secundario sobre oscuro)
text-cream/70   →  Cream al 70%
text-cream/90   →  Cream al 90%
bg-cream/5      →  Cream al 5% (fondo muy sutil)
border-cream/10 →  Borde Cream al 10%
```

---

## Gradientes

Definidos como variables CSS en `src/index.css` y disponibles como clases Tailwind.

| Clase | Descripción | Colores |
|-------|-------------|---------|
| `bg-gradient-hero` | Fondo de hero y botones principales | Cherry `#EA3329` → Tangelo `#ED5B3E` (135°) |
| `bg-gradient-warm` | Fondo cálido suave | Cream claro → Cream (180°) |
| `bg-gradient-soft` | Fondo suave crema-ahumado | Cream → Smoked (135°) |
| `bg-gradient-page` | Fondo de página completa | Cream → Smoked → Tangelo (180°) |

Ejemplo de uso:
```html
<div class="bg-gradient-hero text-primary-foreground">...</div>
```

Gradiente oscuro para overlay de imágenes (usado inline):
```
bg-gradient-to-t from-black/70 via-black/30 to-transparent
bg-gradient-to-t from-black/80 via-black/20 to-transparent
```

---

## Sombras

| Clase | Descripción | Valor CSS |
|-------|-------------|-----------|
| `shadow-soft` | Sombra suave roja/cherry | `0 10px 30px -10px hsl(3 82% 54% / 0.30)` |
| `shadow-card` | Sombra de tarjeta | `0 8px 24px -12px hsl(0 0% 15% / 0.18)` |
| `shadow-glow` | Efecto glow naranja | `0 0 40px hsl(9 84% 59% / 0.40)` |

---

## Tipografía

### Familias de fuentes

| Rol | Fuentes | Clase Tailwind |
|-----|---------|----------------|
| **Display / Títulos grandes** | `Bebas Neue`, `Oswald`, sans-serif | `font-display` |
| **Script / Decorativa** | `Pacifico`, cursive | `font-script` |
| **Body / Cuerpo** | `Sora`, `Inter`, sans-serif | `font-body` / `font-sans` |

> Las fuentes se cargan desde Google Fonts. Asegurarse de que estén importadas en el `index.html` o `index.css`.

### Uso de fuentes por elemento

| Elemento | Fuente | Estilo |
|----------|--------|--------|
| `h1`, `h2`, `h3`, `h4` | Oswald / Bebas Neue | `font-bold uppercase tracking-wide` |
| Títulos de sección / hero | Oswald / Bebas Neue | `font-display text-4xl–7xl` |
| Texto decorativo / logo | Pacifico | `font-script` |
| Párrafos, descripciones | Sora / DM Sans | `font-body text-sm–lg` |
| Precios | Sora | `font-semibold text-primary` |
| Labels y badges | Sora / Oswald | `text-xs–sm uppercase tracking-wide` |

### Escala de tamaños (Tailwind)

```
text-xs    →  0.75rem  (12px)
text-sm    →  0.875rem (14px)
text-base  →  1rem     (16px)
text-lg    →  1.125rem (18px)
text-xl    →  1.25rem  (20px)
text-2xl   →  1.5rem   (24px)
text-3xl   →  1.875rem (30px)
text-4xl   →  2.25rem  (36px)
text-5xl   →  3rem     (48px)
text-6xl   →  3.75rem  (60px)
text-7xl   →  4.5rem   (72px)
```

### Pesos de fuente usados

```
font-normal     →  400
font-medium     →  500
font-semibold   →  600
font-bold       →  700
```

### Espaciado de letras (tracking)

```
tracking-tight   →  -0.025em  (DM Sans en display alt)
tracking-normal  →  0         (body text)
tracking-wide    →  0.025em   (headings Oswald)
tracking-wider   →  0.05em    (labels y badges uppercase)
```

---

## Bordes y Radios

| Variable | Valor | Descripción |
|----------|-------|-------------|
| `--radius` | `1rem` | Radio base del sistema |
| `rounded-lg` | `1rem` | Tarjetas, modales |
| `rounded-md` | `calc(1rem - 4px)` ≈ `0.75rem` | Inputs, botones medianos |
| `rounded-sm` | `calc(1rem - 8px)` ≈ `0.5rem` | Elementos pequeños |
| `rounded-full` | `9999px` | Badges, avatares, botones redondos |

Clase especial:
```css
.doodle-border  →  border: 2px dashed hsl(var(--primary) / 0.40)
```

---

## Transiciones

| Clase | Descripción | Valor CSS |
|-------|-------------|-----------|
| `transition-smooth` | Transición estándar | `all 0.3s cubic-bezier(0.4, 0, 0.2, 1)` |
| `transition-bounce` | Transición con rebote | `all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55)` |

---

## Animaciones (Tailwind custom)

| Clase | Descripción | Duración |
|-------|-------------|----------|
| `animate-fade-in` | Aparece con fade + deslizamiento suave | 0.5s ease-out |
| `animate-scale-in` | Aparece con escala + fade | 0.3s ease-out |
| `animate-slide-in-right` | Entra desde la derecha | 0.3s ease-out |
| `animate-bounce-soft` | Rebote suave continuo | 2s infinito |
| `animate-wiggle` | Pequeña rotación oscilante | 0.6s ease-in-out |
| `animate-pop` | Escala rápida (pop) | 0.3s ease-out |

---

## Efectos hover reutilizables

```css
.hover-lift   →  translateY(-4px) + shadow-card al hacer hover
.hover-scale  →  scale(1.05) al hacer hover
```

---

## Variantes del componente Button

| Variante | Fondo | Texto | Hover |
|----------|-------|-------|-------|
| `default` | `bg-primary` (Cherry) | `text-primary-foreground` (Cream) | `bg-primary/90` |
| `destructive` | `bg-destructive` (Pepper) | `text-destructive-foreground` | `bg-destructive/90` |
| `outline` | `bg-background` | `text-foreground` | `bg-accent` |
| `secondary` | `bg-secondary` (Smoked) | `text-secondary-foreground` | `bg-secondary/80` |
| `ghost` | transparente | `text-foreground` | `bg-accent` |
| `link` | transparente | `text-primary` (Cherry) | subrayado |

---

## Colores de la Sidebar

| Token | Valor HSL | Notas |
|-------|-----------|-------|
| `sidebar-background` | `0 0% 98%` | Blanco roto |
| `sidebar-foreground` | `240 5.3% 26.1%` | Gris azulado oscuro |
| `sidebar-primary` | `240 5.9% 10%` | Muy oscuro |
| `sidebar-accent` | `240 4.8% 95.9%` | Muy claro |
| `sidebar-border` | `220 13% 91%` | Borde suave |
| `sidebar-ring` | `217.2 91.2% 59.8%` | Azul de foco |

---

## Resumen rápido de colores en HEX

```
Cherry   #EA3329  →  Rojo principal, CTAs
Tangelo  #ED5B3E  →  Naranja cálido, gradientes
Mustard  #E88F00  →  Amarillo-naranja, acentos
Pepper   #CC3300  →  Rojo oscuro, errores/destructivo
Mint     #189386  →  Verde azulado, disponible
Cream    #F4E7D0  →  Beige cálido, fondo principal
Smoked   #EDEAE6  →  Beige grisáceo, fondo secundario
Coal     #262626  →  Casi negro, texto y footer
```
