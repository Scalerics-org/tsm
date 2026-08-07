-- Foto por lugar de carga.
--
-- El cliente pidió una foto "en cada línea, es decir en cada lugar de carga". Hasta acá
-- la foto colgaba del viaje (trip_id + kind), así que no había forma de decir cuál era
-- la de Armco y cuál la de Sika.
--
-- Se referencia por `TripSegment.sid` y no por la posición en la lista: las cargas se
-- borran por índice (DELETE /trips/:id/segments/:idx), y con el índice alcanzaba con
-- borrar la primera para que todas las fotos quedaran apuntando a la carga equivocada.
--
-- NULL = foto del viaje entero, que es como venían las que ya existen.
ALTER TABLE trip_photos ADD COLUMN segment_sid TEXT;

CREATE INDEX IF NOT EXISTS idx_trip_photos_segmento ON trip_photos(trip_id, segment_sid);
