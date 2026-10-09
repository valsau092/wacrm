/**
 * Marca visible del producto. Un solo lugar para el nombre y la
 * descripción que aparecen en la pestaña del navegador, en las vistas
 * previas de enlaces (WhatsApp, redes) y en la interfaz.
 *
 * Se pueden sobrescribir por entorno al compilar (NEXT_PUBLIC_*), lo
 * que permite entregar el mismo producto con otra marca a un cliente.
 */
export const BRAND_NAME =
  process.env.NEXT_PUBLIC_BRAND_NAME?.trim() || "VASA CRM";

export const BRAND_DESCRIPTION =
  process.env.NEXT_PUBLIC_BRAND_DESCRIPTION?.trim() ||
  "Plataforma de atención y ventas por WhatsApp de VASA MKT.";
