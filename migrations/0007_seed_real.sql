-- Datos reales del cliente (del Excel "EJEMPLO VIAJES"). Reemplaza las plantillas demo.
-- Mantiene camiones/choferes/usuarios del seed 0005 (choferes PIN 1234, oficina demo1234).

DELETE FROM fuel_logs;
DELETE FROM trip_photos;
DELETE FROM trips;
DELETE FROM trip_templates;
DELETE FROM providers;
DELETE FROM sqlite_sequence WHERE name IN ('providers','trip_templates','trips','trip_photos','fuel_logs');

-- Proveedores / clientes
INSERT INTO providers (id,name) VALUES
  (1,'Casarone'),
  (2,'Nayna'),
  (3,'Molino Cañuelas');

-- Plantillas de viaje (precargadas), con campos y foto de descarga por viaje.
INSERT INTO trip_templates (id,provider_id,name,origin,remite,cargo_type,dest_options,fields,arrival_photo_label,active) VALUES
  (1,1,'Carga Casarone','Artigas','Casarone','Carga',
    '[{"destino":"Montevideo","destinatario":"Tifecom"},{"destino":"Montevideo","destinatario":"TGM"},{"destino":"Montevideo","destinatario":"Otro"}]',
    '[{"key":"remito_carga","label":"Remito de carga","type":"numero","required":true,"stage":"carga"},{"key":"toneladas","label":"Toneladas","type":"numero","required":true,"stage":"carga","is_weight":true}]',
    'Remito de descarga',1),

  (2,2,'Carga Nayna (Saman)','Tacuarembó','Saman','Carga',
    '[{"destino":"Montevideo","destinatario":"Tifecom"},{"destino":"Montevideo","destinatario":"TGM"},{"destino":"Montevideo","destinatario":"Otro"}]',
    '[{"key":"remito_carga","label":"N° remito de carga","type":"numero","required":true,"stage":"carga"},{"key":"toneladas","label":"Toneladas","type":"numero","required":true,"stage":"carga","is_weight":true},{"key":"boleta_rosada","label":"N° boleta rosada (remito válido)","type":"texto","required":false,"stage":"descarga"}]',
    'Boleta rosada firmada (remito válido)',1),

  (3,3,'Reparto Molino Cañuelas','Montevideo','Cañuelas','Pallets',
    '[{"destino":"Salto","destinatario":"Depósito"},{"destino":"Salto","destinatario":"Depósito y Roig"},{"destino":"Salto","destinatario":"Depósito, Roig, Polacof"},{"destino":"Salto","destinatario":"Roig"},{"destino":"Rivera","destinatario":"Jhon"},{"destino":"Artigas","destinatario":"Adriana"},{"destino":"Tacuarembó","destinatario":"Hexion"},{"destino":"Bella Unión","destinatario":"Robalez"},{"destino":"Salto y Artigas","destinatario":"Varios"}]',
    '[{"key":"hoja_ruta","label":"N° hoja de ruta","type":"texto","required":false,"stage":"carga"},{"key":"pallets","label":"Cantidad de pallets","type":"numero","required":false,"stage":"carga"}]',
    'Hoja de ruta firmada',1),

  (4,3,'Devoluciones Molino Cañuelas','Interior (retiro)',NULL,'Devolución',
    '[{"destino":"Montevideo","destinatario":"Molino"}]',
    '[{"key":"origen_retiro","label":"Origen del retiro","type":"texto","required":true,"stage":"carga"},{"key":"remito_empresa","label":"Remito empresa","type":"texto","required":false,"stage":"carga"},{"key":"rto_molino","label":"N° Rto Molino","type":"texto","required":false,"stage":"carga"},{"key":"pallets","label":"Cantidad de pallets","type":"numero","required":false,"stage":"carga"}]',
    NULL,1);

-- Viajes: uno en curso, uno completado con evidencia, y uno completado SIN foto de descarga (para la alerta)
INSERT INTO trips (id,template_id,provider_name,origin,remite,destination,destinatario,driver_id,truck_id,cargo_type,kilos,field_values,status,started_at,finished_at,notes) VALUES
  (1,1,'Casarone','Artigas','Casarone','Montevideo','Tifecom',1,1,'Carga',28.07,'{"remito_carga":"113430","toneladas":"28.07"}','EN_CURSO','2026-07-27 07:10:00',NULL,NULL),
  (2,3,'Molino Cañuelas','Montevideo','Cañuelas','Rivera','Jhon',3,3,'Pallets',NULL,'{"hoja_ruta":"HR-4821","pallets":"18"}','COMPLETADO','2026-07-26 06:00:00','2026-07-26 12:30:00','Entrega sin novedad.'),
  (3,2,'Nayna','Tacuarembó','Saman','Montevideo','Tifecom',2,2,'Carga',28.07,'{"remito_carga":"113430","toneladas":"28.07"}','COMPLETADO','2026-07-24 06:00:00','2026-07-24 14:00:00',NULL);

-- Fotos (placeholder). El viaje 2 tiene carga+descarga; el 3 le falta la descarga (dispara alerta).
INSERT INTO trip_photos (trip_id,r2_key,kind,taken_at) VALUES
  (2,'seed/t2_carga.jpg','carga','2026-07-26 06:05:00'),
  (2,'seed/t2_descarga.jpg','descarga','2026-07-26 12:20:00'),
  (3,'seed/t3_carga.jpg','carga','2026-07-24 06:05:00');

-- Surtidas del camión 1 (llenado a llenado)
INSERT INTO fuel_logs (truck_id,driver_id,trip_id,odometer_km,liters,is_full,r2_key,logged_at) VALUES
  (1,1,NULL,182000,300,1,NULL,'2026-07-05 08:00:00'),
  (1,1,NULL,182450,157,1,NULL,'2026-07-27 07:05:00'),
  (1,1,NULL,182900,160,1,NULL,'2026-08-01 08:00:00'),  -- cierra julio y abre agosto
  (3,3,2,98500,60,1,NULL,'2026-07-26 05:50:00'),
  (3,3,2,98700,70,1,NULL,'2026-07-26 12:40:00');
