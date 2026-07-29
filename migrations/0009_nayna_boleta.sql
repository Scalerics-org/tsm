-- Aclara el viaje de Nayna (Saman): Saman entrega DOS remitos de carga que dicen
-- lo mismo con números distintos, y el válido es siempre el de la boleta rosada.
-- Se explicita en las etiquetas del campo y de la foto de descarga.
UPDATE trip_templates
SET fields = '[{"key":"remito_carga","label":"N° remito de carga","type":"numero","required":true,"stage":"carga"},{"key":"toneladas","label":"Toneladas","type":"numero","required":true,"stage":"carga","is_weight":true},{"key":"boleta_rosada","label":"N° boleta rosada (remito válido)","type":"texto","required":false,"stage":"descarga"}]',
    arrival_photo_label = 'Boleta rosada firmada (remito válido)'
WHERE provider_id = 2;
