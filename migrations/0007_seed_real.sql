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
INSERT INTO trip_templates (id,provider_id,name,origin,cargo_type,dest_options,fields,arrival_photo_label,active) VALUES
  (1,1,'Carga Casarone','Artigas','Carga',
    '[{"destino":"Montevideo","destinatario":"Tifecom"},{"destino":"Montevideo","destinatario":"TGM"},{"destino":"Montevideo","destinatario":"Otro"}]',
    '[{"key":"remito_carga","label":"Remito de carga","type":"numero","required":true,"stage":"carga"},{"key":"toneladas","label":"Toneladas","type":"numero","required":true,"stage":"carga","is_weight":true}]',
    'Remito de descarga',1),

  (2,2,'Carga Nayna (Saman)','Tacuarembó','Carga',
    '[{"destino":"Montevideo","destinatario":"Tifecom"},{"destino":"Montevideo","destinatario":"TGM"},{"destino":"Montevideo","destinatario":"Otro"}]',
    '[{"key":"remito_carga","label":"Remito de carga","type":"numero","required":true,"stage":"carga"},{"key":"toneladas","label":"Toneladas","type":"numero","required":true,"stage":"carga","is_weight":true}]',
    'Hoja rosada firmada',1),

  (3,3,'Reparto Molino Cañuelas','Montevideo','Pallets',
    '[{"destino":"Salto","destinatario":"Depósito"},{"destino":"Salto","destinatario":"Depósito y Roig"},{"destino":"Salto","destinatario":"Depósito, Roig, Polacof"},{"destino":"Salto","destinatario":"Roig"},{"destino":"Rivera","destinatario":"Jhon"},{"destino":"Artigas","destinatario":"Adriana"},{"destino":"Tacuarembó","destinatario":"Hexion"},{"destino":"Bella Unión","destinatario":"Robalez"},{"destino":"Salto y Artigas","destinatario":"Varios"}]',
    '[{"key":"hoja_ruta","label":"N° hoja de ruta","type":"texto","required":false,"stage":"carga"},{"key":"pallets","label":"Cantidad de pallets","type":"numero","required":false,"stage":"carga"}]',
    'Hoja de ruta firmada',1),

  (4,3,'Devoluciones Molino Cañuelas','Interior (retiro)','Devolución',
    '[{"destino":"Montevideo","destinatario":"Molino"}]',
    '[{"key":"origen_retiro","label":"Origen del retiro","type":"texto","required":true,"stage":"carga"},{"key":"remito_empresa","label":"Remito empresa","type":"texto","required":false,"stage":"carga"},{"key":"rto_molino","label":"N° Rto Molino","type":"texto","required":false,"stage":"carga"},{"key":"pallets","label":"Cantidad de pallets","type":"numero","required":false,"stage":"carga"}]',
    NULL,1);

-- Un viaje en curso (Casarone, Carlos/STZ 4821) y uno completado (Reparto, Diego/MRC 1177)
INSERT INTO trips (id,template_id,provider_name,origin,destination,destinatario,driver_id,truck_id,cargo_type,kilos,field_values,status,started_at,finished_at,notes) VALUES
  (1,1,'Casarone','Artigas','Montevideo','Tifecom',1,1,'Carga',28.07,'{"remito_carga":"113430","toneladas":"28.07"}','EN_CURSO','2026-07-27 07:10:00',NULL,NULL),
  (2,3,'Molino Cañuelas','Montevideo','Rivera','Jhon',3,3,'Pallets',NULL,'{"hoja_ruta":"HR-4821","pallets":"18"}','COMPLETADO','2026-07-26 06:00:00','2026-07-26 12:30:00','Entrega sin novedad.');

-- Surtidas del camión 1 (llenado a llenado)
INSERT INTO fuel_logs (truck_id,driver_id,trip_id,odometer_km,liters,is_full,r2_key,logged_at) VALUES
  (1,1,NULL,182000,300,1,NULL,'2026-07-05 08:00:00'),
  (1,1,NULL,182450,157,1,NULL,'2026-07-27 07:05:00'),
  (3,3,2,98500,60,1,NULL,'2026-07-26 05:50:00'),
  (3,3,2,98700,70,1,NULL,'2026-07-26 12:40:00');
