-- Datos de ejemplo v2. Choferes: PIN 1234. Encargado/Admin: demo1234.

DELETE FROM fuel_logs;
DELETE FROM trip_photos;
DELETE FROM trips;
DELETE FROM trip_templates;
DELETE FROM providers;
DELETE FROM push_subscriptions;
DELETE FROM users;
DELETE FROM drivers;
DELETE FROM trucks;
DELETE FROM sqlite_sequence WHERE name IN
  ('trucks','drivers','users','providers','trip_templates','trips','trip_photos','fuel_logs');

-- Camiones
INSERT INTO trucks (id,plate,brand,model,year,type,capacity_kg,odometer_km,avg_consumption_l100,status) VALUES
  (1,'STZ 4821','Scania','R450',2021,'Tolva',28000,182450,35.0,'disponible'),
  (2,'BQL 7390','Volvo','FH16',2019,'Tanque',30000,341200,38.0,'disponible'),
  (3,'MRC 1177','Mercedes-Benz','Actros',2022,'Furgón',24000,98700,30.0,'disponible');

-- Choferes (PIN 1234) con camión habitual
INSERT INTO drivers (id,name,document,license_number,license_category,license_expiry,phone,status,pin_hash,default_truck_id) VALUES
  (1,'Carlos Méndez','4.123.456-7','LIC-10231','C','2027-05-14','+598 99 123 456','activo','pbkdf2$100000$f153c0e576e1aab8522056277a9130a0$b12302f188ca1ed6dd9206e8e66ccdbfa820ea42cdf0f03dd562e135966b497f',1),
  (2,'Marta Rodríguez','3.987.654-1','LIC-20984','D','2026-11-02','+598 98 765 432','activo','pbkdf2$100000$ed63dc9cbe8f95f885bc92dd16aff405$27441c7ad1b4cae05d5263c79bc653d276ccea6bcbaf162e54c4978147055255',2),
  (3,'Diego Fernández','5.222.333-9','LIC-30877','C','2025-09-20','+598 91 555 777','activo','pbkdf2$100000$c6bf2dffb1e7bbdd045d2e2d3581a66f$59e96013aff3f66d2d12f3db0bdd0a12c446bfa975b402be43bba9c891b7ce9f',3);

-- Usuarios de oficina (password: demo1234)
INSERT INTO users (email,password_hash,name,role,driver_id) VALUES
  ('admin@demo.uy','pbkdf2$100000$bf5635c1f4caae7ca3470f1dd4199bf9$b0e6d4e4f4e9a320e6d295a6ca673a15b4484be93db7c41b7d2b77b363a9f3a2','Admin General','admin',NULL),
  ('ops@demo.uy','pbkdf2$100000$e86662392d398b8d21f6039cc3205e90$e0b34804d74e61935d978f1122e76717c64371dc384d181a9026a16700cee69f','Laura Operaciones','encargado',NULL);

-- Proveedores
INSERT INTO providers (id,name) VALUES
  (1,'Molino Río Negro'),
  (2,'ANCAP'),
  (3,'Aguas del Este'),
  (4,'Export Internacional');

-- Plantillas de viaje (precargados)
INSERT INTO trip_templates (id,provider_id,name,origin,destinations,cargo_type,requires_kilos,extra_label,extra_type,extra_required,active) VALUES
  (1,1,'Harina desde molino','Montevideo','["Paysandú","Trinidad","Rivera","Tacuarembó"]','Harina',1,NULL,'none',0,1),
  (2,2,'Combustible ANCAP','Montevideo','["Minas","Maldonado","Colonia del Sacramento"]','Combustible',0,NULL,'none',0,1),
  (3,3,'Agua a granel','Montevideo','["Minas"]','Agua',0,NULL,'none',0,1),
  (4,4,'Carga internacional','Montevideo','["Rivera (frontera)","Chuy","Fray Bentos"]','Internacional',1,'Número MIC','texto',1,1);

-- Un viaje en curso y uno completado
INSERT INTO trips (id,template_id,provider_name,origin,destination,driver_id,truck_id,cargo_type,kilos,extra_label,extra_value,status,started_at,finished_at,notes) VALUES
  (1,1,'Molino Río Negro','Montevideo','Paysandú',1,1,'Harina',24000,NULL,NULL,'EN_CURSO','2026-07-27 07:10:00',NULL,NULL),
  (2,2,'ANCAP','Montevideo','Minas',3,3,'Combustible',NULL,NULL,NULL,'COMPLETADO','2026-07-26 06:00:00','2026-07-26 10:30:00','Sin novedad.');

-- Surtidas del camión 1 (llenado a llenado → consumo)
INSERT INTO fuel_logs (truck_id,driver_id,trip_id,odometer_km,liters,is_full,r2_key,logged_at) VALUES
  (1,1,NULL,182000,300,1,NULL,'2026-07-20 08:00:00'),
  (1,1,NULL,182450,157,1,NULL,'2026-07-27 07:05:00'),
  (3,3,2,98500,60,1,NULL,'2026-07-26 05:50:00'),
  (3,3,2,98700,70,1,NULL,'2026-07-26 11:00:00');
