-- El número de factura, anotado a mano desde el sistema de DGI.
--
-- "Nosotros tenemos un sistema de facturación electrónica conectado con DGI... yo le pongo el
-- número de factura de factura electrónica. Cuando facturamos le digo, anotate todos estos
-- viajes que punteamos ahora, le pongo el número de factura a todos los viajes."
--
-- ACÁ NO SE GENERA NINGÚN NÚMERO. La factura la emite su sistema; lo único que guarda la app es
-- cuál es y a qué viajes les tocó, para que se cumpla lo que de verdad importa: "al mes que
-- viene, yo ya sé que todo lo que está con el número de factura, esos viajes quedan afuera".
--
-- La marca va POR VIAJE y no por período: el corte lo define él al facturar, no el calendario.
-- "Casarone hoy 19 cierra el mes, el mes que viene puede cerrar el 26." Un período guardado
-- empieza a mentir el día que el corte se corre; el viaje marcado no se mueve nunca.
ALTER TABLE trips ADD COLUMN factura_numero TEXT;
ALTER TABLE trips ADD COLUMN facturado_at TEXT;
ALTER TABLE trips ADD COLUMN facturado_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- El cobro es el paso siguiente: "y cuando pagan, vengo y le pongo pago". Las columnas quedan
-- hechas porque la forma ya se sabe —el pago cuelga de la factura y la factura del viaje— pero
-- HOY NO LAS ESCRIBE NADIE: "hoy lo que me interesa es facturado". Se llenan cuando esa
-- pantalla exista; mientras tanto quedan en NULL y no cambian ninguna cuenta.
ALTER TABLE trips ADD COLUMN pago_at TEXT;
ALTER TABLE trips ADD COLUMN pago_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
