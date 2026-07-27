-- Datos de ejemplo para probar la demo.
-- Todos los usuarios tienen la contraseña: demo1234

DELETE FROM trip_positions;
DELETE FROM trip_photos;
DELETE FROM trips;
DELETE FROM cargos;
DELETE FROM users;
DELETE FROM trucks;
DELETE FROM drivers;
DELETE FROM sqlite_sequence WHERE name IN
  ('drivers','trucks','users','cargos','trips','trip_photos','trip_positions');

-- Choferes
INSERT INTO drivers (id,name,document,license_number,license_category,license_expiry,phone,status) VALUES
  (1,'Carlos Méndez','4.123.456-7','LIC-10231','C','2027-05-14','+598 99 123 456','activo'),
  (2,'Marta Rodríguez','3.987.654-1','LIC-20984','D','2026-11-02','+598 98 765 432','activo'),
  (3,'Diego Fernández','5.222.333-9','LIC-30877','C','2025-09-20','+598 91 555 777','activo');

-- Camiones (con rendimiento L/100km)
INSERT INTO trucks (id,plate,brand,model,year,type,capacity_kg,odometer_km,avg_consumption_l100,status) VALUES
  (1,'STZ 4821','Scania','R450',2021,'Tolva',28000,182450,32.5,'en_viaje'),
  (2,'BQL 7390','Volvo','FH16',2019,'Tanque',30000,341200,35.0,'disponible'),
  (3,'MRC 1177','Mercedes-Benz','Actros',2022,'Furgón',24000,98700,29.8,'disponible');

-- Usuarios (password: demo1234)
INSERT INTO users (email,password_hash,name,role,driver_id) VALUES
  ('admin@demo.uy','pbkdf2$100000$bf5635c1f4caae7ca3470f1dd4199bf9$b0e6d4e4f4e9a320e6d295a6ca673a15b4484be93db7c41b7d2b77b363a9f3a2','Admin General','admin',NULL),
  ('ops@demo.uy','pbkdf2$100000$e86662392d398b8d21f6039cc3205e90$e0b34804d74e61935d978f1122e76717c64371dc384d181a9026a16700cee69f','Laura Operaciones','encargado',NULL),
  ('carlos@demo.uy','pbkdf2$100000$d28b93f9e8ca1a041b4e876d250dbd30$cb93f503a7db634fa9c87891b30ac32bf8934c515dc35cfc458f2e5c82c5316e','Carlos Méndez','chofer',1),
  ('marta@demo.uy','pbkdf2$100000$fd7374ce8303c88a49327a6a797211f8$79191e6210ce0e44725834219c9afc0f3374babf291a31f77f73c670a21bad8a','Marta Rodríguez','chofer',2),
  ('diego@demo.uy','pbkdf2$100000$c43125972486b6d424b7c5b38eba2a01$04d24cf8d7eaba8af2a562dd05bfa9f7b70d495556fccf0382742224f1597981','Diego Fernández','chofer',3);

-- Cargas
INSERT INTO cargos (id,description,weight_kg,quantity,client,type,doc_number) VALUES
  (1,'Cemento a granel',24000,480,'Constructora del Este','A granel','REM-00841'),
  (2,'Combustible diésel',28000,28000,'ANCAP','Peligrosa','REM-00933'),
  (3,'Electrodomésticos paletizados',12000,320,'MercadoHogar','Frágil','REM-01002'),
  (4,'Granos de soja',26000,26000,'Agro Litoral','A granel','REM-01100');

-- Viajes
-- (1) COMPLETADO: Montevideo -> Punta del Este
INSERT INTO trips (id,driver_id,truck_id,origin,origin_lat,origin_lon,destination,dest_lat,dest_lon,
                   scheduled_at,status,cargo_id,distance_km,manual_km,departed_at,arrived_at,notes,created_by,created_at)
VALUES (1,3,3,'Montevideo',-34.9011,-56.1645,'Punta del Este',-34.9600,-54.9500,
        '2026-07-25 07:00:00','COMPLETADO',3,138.4,NULL,'2026-07-25 07:12:00','2026-07-25 09:05:00',
        'Entrega sin novedad.',2,'2026-07-24 18:00:00');

-- (2) EN_RUTA: Montevideo -> Colonia del Sacramento (con traza GPS)
INSERT INTO trips (id,driver_id,truck_id,origin,origin_lat,origin_lon,destination,dest_lat,dest_lon,
                   scheduled_at,status,cargo_id,distance_km,manual_km,departed_at,arrived_at,notes,created_by,created_at)
VALUES (2,1,1,'Montevideo',-34.9011,-56.1645,'Colonia del Sacramento',-34.4626,-57.8400,
        '2026-07-27 08:00:00','EN_RUTA',1,14.0,NULL,'2026-07-27 08:15:00',NULL,
        NULL,2,'2026-07-26 20:00:00');

-- (3) PENDIENTE: Paysandú -> Salto
INSERT INTO trips (id,driver_id,truck_id,origin,origin_lat,origin_lon,destination,dest_lat,dest_lon,
                   scheduled_at,status,cargo_id,distance_km,manual_km,departed_at,arrived_at,notes,created_by,created_at)
VALUES (3,2,2,'Paysandú',-32.3214,-58.0756,'Salto',-31.3833,-57.9667,
        '2026-07-28 06:30:00','PENDIENTE',2,120.5,NULL,NULL,NULL,NULL,2,'2026-07-27 09:00:00');

-- (4) CON_INCIDENCIA: Montevideo -> Paysandú
INSERT INTO trips (id,driver_id,truck_id,origin,origin_lat,origin_lon,destination,dest_lat,dest_lon,
                   scheduled_at,status,cargo_id,distance_km,manual_km,departed_at,arrived_at,notes,created_by,created_at)
VALUES (4,1,1,'Montevideo',-34.9011,-56.1645,'Paysandú',-32.3214,-58.0756,
        '2026-07-24 05:00:00','CON_INCIDENCIA',4,180.0,NULL,'2026-07-24 05:20:00',NULL,
        'Desperfecto mecánico a la altura de Trinidad. Camión detenido.',2,'2026-07-23 19:00:00');

-- (5) PENDIENTE: Colonia -> Montevideo (para Diego)
INSERT INTO trips (id,driver_id,truck_id,origin,origin_lat,origin_lon,destination,dest_lat,dest_lon,
                   scheduled_at,status,cargo_id,distance_km,manual_km,departed_at,arrived_at,notes,created_by,created_at)
VALUES (5,3,3,'Colonia del Sacramento',-34.4626,-57.8400,'Montevideo',-34.9011,-56.1645,
        '2026-07-29 14:00:00','PENDIENTE',3,177.0,NULL,NULL,NULL,NULL,2,'2026-07-27 09:30:00');

-- Fotos (placeholder — el frontend muestra un marcador si la key no existe en R2)
INSERT INTO trip_photos (trip_id,r2_key,kind,taken_at,lat,lon) VALUES
  (1,'seed/t1_salida.jpg','carga_salida','2026-07-25 07:12:00',-34.9011,-56.1645),
  (1,'seed/t1_llegada.jpg','carga_llegada','2026-07-25 09:05:00',-34.9600,-54.9500),
  (1,'seed/t1_comb.jpg','combustible','2026-07-25 09:06:00',-34.9600,-54.9500),
  (2,'seed/t2_salida.jpg','carga_salida','2026-07-27 08:15:00',-34.9011,-56.1645),
  (4,'seed/t4_salida.jpg','carga_salida','2026-07-24 05:20:00',-34.9011,-56.1645);

-- Traza GPS del viaje 2 (EN_RUTA): tramo inicial sobre tierra saliendo de Montevideo
-- por Ruta 1. El resto de la ruta se ve punteada (OSRM) y avanza con el seguimiento real
-- del chofer o con el botón de simulación.
INSERT INTO trip_positions (trip_id,lat,lon,recorded_at,seq) VALUES
  (2,-34.9011,-56.1645,'2026-07-27 08:15:00',1),
  (2,-34.8710,-56.2200,'2026-07-27 08:25:00',2),
  (2,-34.8450,-56.2780,'2026-07-27 08:35:00',3);
