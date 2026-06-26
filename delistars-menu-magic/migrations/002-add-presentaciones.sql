-- Migración 002: Bebidas (Jugos de la Casa) con variantes (presentaciones).
-- Idempotente: segura de correr en una BD de producción ya sembrada.
-- Aplica los cambios que en una BD nueva harían init.sql + seeds.sql.

-- 1) Tabla de presentaciones (variantes por sabor/tamaño/base)
CREATE TABLE IF NOT EXISTS public.presentacion_producto
(
    id_presentacion serial NOT NULL,
    id_producto integer NOT NULL,
    tamano character varying(50) NOT NULL,
    base character varying(50),
    sabor character varying(100),
    precio_venta numeric(12, 2) NOT NULL,
    CONSTRAINT presentacion_producto_pkey PRIMARY KEY (id_presentacion),
    CONSTRAINT presentacion_producto_id_producto_fkey FOREIGN KEY (id_producto)
        REFERENCES public.tbl_productos (id_producto) MATCH SIMPLE
        ON UPDATE NO ACTION ON DELETE NO ACTION
);

-- 2) Categoría "Bebidas"
INSERT INTO public.categoria (id_categoria, nombre_categoria)
VALUES (7, 'Bebidas')
ON CONFLICT (id_categoria) DO NOTHING;

-- 3) Producto contenedor "Jugos de la Casa" (precio 0: el real lo da la presentación)
INSERT INTO public.tbl_productos (id_producto, nombre_producto, descripcion_producto, precio_venta, id_categoria, image_url1, image_url2)
VALUES (48, 'Jugos de la Casa', 'Deliciosos jugos naturales preparados al instante. Elige tu sabor, tamaño y base favorita.', 0.00, 7, 'https://res.cloudinary.com/dfx530yml/image/upload/v1782487997/WhatsApp_Image_2026-06-25_at_8.33.14_PM_fux53y.jpg', 'https://res.cloudinary.com/dfx530yml/image/upload/v1782487987/WhatsApp_Image_2026-06-25_at_8.33.53_PM_qlal5g.jpg')
ON CONFLICT (id_producto) DO NOTHING;

-- 4) Presentaciones del producto 48 (idempotente: limpia y re-inserta)
DELETE FROM public.presentacion_producto WHERE id_producto = 48;
INSERT INTO public.presentacion_producto (id_producto, sabor, tamano, base, precio_venta)
VALUES
(48, 'Limonada de Coco', '14 oz', 'Leche', 7500.00),
(48, 'Limonada de Coco', '1 Litro', 'Leche', 13500.00),
(48, 'Limonada Natural', '14 oz', 'Agua', 6500.00),
(48, 'Limonada Natural', '1 Litro', 'Agua', 11500.00),
(48, 'Guanábana', '14 oz', 'Agua', 6500.00),
(48, 'Guanábana', '14 oz', 'Leche', 7500.00),
(48, 'Guanábana', '1 Litro', 'Agua', 11500.00),
(48, 'Guanábana', '1 Litro', 'Leche', 13500.00),
(48, 'Fresa', '14 oz', 'Agua', 6500.00),
(48, 'Fresa', '14 oz', 'Leche', 7500.00),
(48, 'Fresa', '1 Litro', 'Agua', 11500.00),
(48, 'Fresa', '1 Litro', 'Leche', 13500.00),
(48, 'Mora', '14 oz', 'Agua', 6500.00),
(48, 'Mora', '14 oz', 'Leche', 7500.00),
(48, 'Mora', '1 Litro', 'Agua', 11500.00),
(48, 'Mora', '1 Litro', 'Leche', 13500.00),
(48, 'Piña', '14 oz', 'Agua', 6500.00),
(48, 'Piña', '1 Litro', 'Agua', 11500.00),
(48, 'Maracuyá', '14 oz', 'Agua', 6500.00),
(48, 'Maracuyá', '14 oz', 'Leche', 7500.00),
(48, 'Maracuyá', '1 Litro', 'Agua', 11500.00),
(48, 'Maracuyá', '1 Litro', 'Leche', 13500.00),
(48, 'Tomate de Árbol', '14 oz', 'Agua', 6500.00),
(48, 'Tomate de Árbol', '14 oz', 'Leche', 7500.00),
(48, 'Tomate de Árbol', '1 Litro', 'Agua', 11500.00),
(48, 'Tomate de Árbol', '1 Litro', 'Leche', 13500.00),
(48, 'Guayaba', '14 oz', 'Agua', 6500.00),
(48, 'Guayaba', '14 oz', 'Leche', 7500.00),
(48, 'Guayaba', '1 Litro', 'Agua', 11500.00),
(48, 'Guayaba', '1 Litro', 'Leche', 13500.00),
(48, 'Uva', '14 oz', 'Agua', 6500.00),
(48, 'Uva', '1 Litro', 'Agua', 11500.00);

-- Reinicia la secuencia del serial tras los inserts explícitos
SELECT setval(pg_get_serial_sequence('public.presentacion_producto', 'id_presentacion'), (SELECT MAX(id_presentacion) FROM public.presentacion_producto));

-- 5) Bebidas simples (gaseosas, jugos embotellados) con precio directo
INSERT INTO public.tbl_productos (id_producto, nombre_producto, descripcion_producto, precio_venta, id_categoria, image_url1, image_url2)
VALUES
(49, 'Coca Cola Zero 1.5 Litros', 'Bebida embotellada', 7500.00, 7, 'https://res.cloudinary.com/dfx530yml/image/upload/v1782505169/Gemini_Generated_Image_kfhqynkfhqynkfhq_snfl4h.png', ''),
(50, 'Coca Cola Sabor Original 1.5 Litros', 'Bebida embotellada', 8000.00, 7, 'https://res.cloudinary.com/dfx530yml/image/upload/v1782505166/Gemini_Generated_Image_pa60rmpa60rmpa60_xvmuo7.png', ''),
(51, 'Premio 1.5 Litros', 'Bebida embotellada', 8000.00, 7, 'https://res.cloudinary.com/dfx530yml/image/upload/v1782505158/Gemini_Generated_Image_616csw616csw616c_dju9mz.png', ''),
(52, 'Quatro 1.5 Litros', 'Bebida embotellada', 8000.00, 7, 'https://res.cloudinary.com/dfx530yml/image/upload/v1782505172/Gemini_Generated_Image_77yqcb77yqcb77yq_rmog3x.png', ''),
(53, 'Manzana Postobón Pet 400 ml', 'Bebida embotellada', 4000.00, 7, 'https://res.cloudinary.com/dfx530yml/image/upload/v1782505173/Gemini_Generated_Image_8f9vgn8f9vgn8f9v_mqhefh.png', ''),
(54, 'Uva Postobón Pet 400 ml', 'Bebida embotellada', 4000.00, 7, 'https://res.cloudinary.com/dfx530yml/image/upload/v1782505170/Gemini_Generated_Image_6fbalb6fbalb6fba_qrvmlh.png', ''),
(55, 'Naranjada Postobón Pet 400 ml', 'Bebida embotellada', 4000.00, 7, 'https://res.cloudinary.com/dfx530yml/image/upload/v1782505163/Gemini_Generated_Image_30ro0q30ro0q30ro_aibjvq.png', ''),
(56, 'Colombiana Pet 400 ml', 'Bebida embotellada', 4000.00, 7, 'https://res.cloudinary.com/dfx530yml/image/upload/v1782505162/Gemini_Generated_Image_7ebf8s7ebf8s7ebf_ww00k3.png', ''),
(57, 'Coca Cola Sabor Original Pet 400 ml', 'Bebida embotellada', 4500.00, 7, 'https://res.cloudinary.com/dfx530yml/image/upload/v1782506224/Gemini_Generated_Image_9uir949uir949uir_1_ihiwt9.png', ''),
(58, 'Coca Cola Zero Pet 400 ml', 'Bebida embotellada', 4000.00, 7, 'https://res.cloudinary.com/dfx530yml/image/upload/v1782505162/Gemini_Generated_Image_oilg3xoilg3xoilg_dzsn1e.png', ''),
(59, 'Coca Cola Mini 250 ml', 'Bebida embotellada', 3500.00, 7, 'https://res.cloudinary.com/dfx530yml/image/upload/v1782505163/Gemini_Generated_Image_bh26rcbh26rcbh26_jonmhl.png', ''),
(60, 'Agua saborizada manzana', 'Bebida embotellada', 4000.00, 7, 'https://res.cloudinary.com/dfx530yml/image/upload/v1782505588/Gemini_Generated_Image_7rbsuz7rbsuz7rbs_1_q6xtp4.png', ''),
(61, 'Agua saborizada limon', 'Bebida embotellada', 4000.00, 7, 'https://res.cloudinary.com/dfx530yml/image/upload/v1782505636/Gemini_Generated_Image_lnmboslnmboslnmb_1_pisudi.png', ''),
(62, 'Jugo Hit Tropical Personal', 'Bebida embotellada', 3800.00, 7, 'https://res.cloudinary.com/dfx530yml/image/upload/v1782505580/Gemini_Generated_Image_hgopiehgopiehgop_1_ncirgr.png', ''),
(63, 'Jugo Hit Mora Personal', 'Bebida embotellada', 3800.00, 7, 'https://res.cloudinary.com/dfx530yml/image/upload/v1782505729/Gemini_Generated_Image_ng5423ng5423ng54_1_uparkl.png', '')
ON CONFLICT (id_producto) DO NOTHING;
