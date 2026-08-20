#!/usr/bin/env python3
"""Genera la ficha de ingredientes descargable (PDF) de DeliStars.

Lee src/data/ingredientes.json — la MISMA fuente que usa la sección de
ingredientes de la página — para que el PDF y la web nunca digan cosas
distintas. Al cambiar el JSON hay que volver a correr esto:

    python scripts/generar-ficha-ingredientes.py

Salida: public/ficha-ingredientes-delistars.pdf
"""
import json
from datetime import date
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate, Frame, KeepTogether, PageTemplate, Paragraph, Spacer, Table, TableStyle,
)

RAIZ    = Path(__file__).resolve().parent.parent
DATOS   = RAIZ / "src" / "data" / "ingredientes.json"
SALIDA  = RAIZ / "public" / "ficha-ingredientes-delistars.pdf"

# Paleta de la marca (misma que la web)
CHERRY  = colors.HexColor("#C1272D")
TANGELO = colors.HexColor("#E85D22")
COAL    = colors.HexColor("#2B2B2B")
CREAM   = colors.HexColor("#FAF3E8")
GRIS    = colors.HexColor("#6B6B6B")

MESES = ("enero febrero marzo abril mayo junio julio agosto "
         "septiembre octubre noviembre diciembre").split()


def estilos():
    base = getSampleStyleSheet()
    return {
        "titulo": ParagraphStyle("titulo", parent=base["Title"], fontName="Helvetica-Bold",
                                 fontSize=24, leading=28, textColor=CHERRY, spaceAfter=2),
        "sub": ParagraphStyle("sub", parent=base["Normal"], fontName="Helvetica",
                              fontSize=10.5, leading=15, textColor=GRIS,
                              alignment=TA_CENTER, spaceAfter=14),
        "aviso": ParagraphStyle("aviso", parent=base["Normal"], fontName="Helvetica-Bold",
                                fontSize=11, leading=16, textColor=COAL, alignment=TA_CENTER),
        "familia": ParagraphStyle("familia", parent=base["Heading2"], fontName="Helvetica-Bold",
                                  fontSize=15, leading=19, textColor=TANGELO,
                                  spaceBefore=14, spaceAfter=4),
        "nota": ParagraphStyle("nota", parent=base["Normal"], fontName="Helvetica-Oblique",
                               fontSize=9, leading=13, textColor=GRIS, spaceAfter=6),
        "prod": ParagraphStyle("prod", parent=base["Normal"], fontName="Helvetica-Bold",
                               fontSize=9.5, leading=13, textColor=COAL),
        "lleva": ParagraphStyle("lleva", parent=base["Normal"], fontName="Helvetica",
                                fontSize=9.5, leading=13, textColor=GRIS),
        "pie": ParagraphStyle("pie", parent=base["Normal"], fontName="Helvetica",
                              fontSize=9, leading=13, textColor=GRIS, alignment=TA_CENTER),
    }


def caja(texto, st, fondo, borde):
    """Recuadro de una sola celda (para los avisos destacados)."""
    t = Table([[Paragraph(texto, st)]], colWidths=[170 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, -1), fondo),
        ("BOX",          (0, 0), (-1, -1), 1, borde),
        ("LEFTPADDING",  (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING",   (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ]))
    return t


def tabla_productos(productos, st):
    filas = []
    for p in productos:
        detalle = ", ".join(p["lleva"]) if p["lleva"] else "Solo la preparación base"
        if p.get("nota"):
            detalle += f'<br/><font size="8" color="#8A8A8A"><i>{p["nota"]}</i></font>'
        filas.append([Paragraph(p["nombre"], st["prod"]), Paragraph(detalle, st["lleva"])])

    t = Table(filas, colWidths=[62 * mm, 108 * mm], hAlign="LEFT")
    t.setStyle(TableStyle([
        ("VALIGN",       (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW",    (0, 0), (-1, -2), 0.4, colors.HexColor("#E4DCCF")),
        ("LEFTPADDING",  (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING",   (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return t


def marca_pagina(canvas, doc):
    """Franja superior y pie con número de página."""
    canvas.saveState()
    ancho, alto = letter
    canvas.setFillColor(CHERRY)
    canvas.rect(0, alto - 12 * mm, ancho, 12 * mm, stroke=0, fill=1)
    canvas.setFillColor(CREAM)
    canvas.setFont("Helvetica-Bold", 10)
    canvas.drawString(20 * mm, alto - 8 * mm, "DELISTARS  ·  TASTY & COOL")
    canvas.setFont("Helvetica", 9)
    canvas.drawRightString(ancho - 20 * mm, alto - 8 * mm, "Ficha de ingredientes")

    canvas.setFillColor(GRIS)
    canvas.setFont("Helvetica", 8)
    canvas.drawCentredString(ancho / 2, 12 * mm, f"Página {doc.page}")
    canvas.restoreState()


def main():
    datos = json.loads(DATOS.read_text(encoding="utf-8"))
    st = estilos()
    hoy = date.today()

    doc = BaseDocTemplate(
        str(SALIDA), pagesize=letter,
        leftMargin=20 * mm, rightMargin=20 * mm,
        topMargin=20 * mm, bottomMargin=18 * mm,
        title="DeliStars — Ficha de ingredientes",
        author="DeliStars", subject="Qué lleva cada producto del menú",
    )
    marco = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="cuerpo")
    doc.addPageTemplates([PageTemplate(id="base", frames=[marco], onPage=marca_pagina)])

    hist = [
        Paragraph("¿Qué lleva cada producto?", st["titulo"]),
        Paragraph("Para que nadie se lleve sorpresas: esto es lo que trae cada uno "
                  "de los productos de nuestro menú.", st["sub"]),
    ]

    # La duda más frecuente va de primera.
    if datos.get("ensalada"):
        hist += [caja(datos["ensaladaNota"], st["aviso"],
                      colors.HexColor("#FBECEC"), CHERRY),
                 Spacer(1, 6)]

    for fam in datos["familias"]:
        bloque = [Paragraph(fam["titulo"], st["familia"])]
        if fam.get("base"):
            bloque.append(caja("<b>Todos llevan:</b> " + " · ".join(fam["base"]),
                               st["lleva"], CREAM, colors.HexColor("#E4DCCF")))
            bloque.append(Spacer(1, 6))
        if fam.get("nota"):
            bloque.append(Paragraph(fam["nota"], st["nota"]))
        if fam["productos"]:
            bloque.append(tabla_productos(fam["productos"], st))
        # El título de la familia nunca debe quedar solo al final de una página.
        hist.append(KeepTogether(bloque[:2]) if len(bloque) > 1 else bloque[0])
        hist += bloque[2:]

    hist += [
        Spacer(1, 14),
        caja("<b>Salsas de la casa, incluidas:</b> " + ", ".join(datos["salsas"]) +
             ".<br/><b>Cebolla a elegir:</b> " + ", ".join(datos["cebollas"]).lower() + ".",
             st["lleva"], CREAM, colors.HexColor("#E4DCCF")),
        Spacer(1, 14),
        Paragraph("¿Tienes una alergia o una restricción alimentaria? Escríbenos antes de pedir "
                  "y te confirmamos la preparación exacta del producto que te interesa.", st["pie"]),
        Spacer(1, 4),
        Paragraph(f"delistars.com · Actualizada en {MESES[hoy.month - 1]} de {hoy.year}", st["pie"]),
    ]

    doc.build(hist)
    print(f"PDF generado: {SALIDA}  ({SALIDA.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
