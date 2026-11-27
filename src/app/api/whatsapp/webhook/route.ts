import { NextRequest, NextResponse } from "next/server";
import { verifyKapsoSignature, sendWhatsAppText, soloDigitos } from "@/src/lib/kapso";
import { esSolicitud, esSolicitudNueva, parseSolicitud, FORMATO_AYUDA } from "@/src/lib/parse-cotizacion";
import {
  buscarUsuarioPorWhatsapp,
  yaProcesado,
  crearSolicitudCotizacion,
} from "@/src/lib/whatsapp-db";
import { readTenantHeaders } from "@/src/lib/tenant-context";
import { isEventForPhoneNumber, isWhatsappTenantAllowed } from "@/src/lib/whatsapp-intake";

type KapsoEvent = {
  phone_number_id?: string;
  conversation?: { phone_number?: string; phone_number_id?: string };
  message?: {
    id: string;
    from?: string;
    type?: string;
    text?: { body?: string };
    kapso?: { direction?: string };
  };
};
type KapsoPayload = KapsoEvent & { batch?: boolean; data?: KapsoEvent[] };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // 1) El tenant lo resuelve src/proxy.ts por el host (p. ej. sari.forwarders.app).
  //    Por ahora solo la empresa dueña del número (KAPSO_TENANT_SLUG) recibe mensajes;
  //    el dominio de plataforma, otro tenant o la falta de configuración responden 404.
  const tenant = readTenantHeaders(req.headers);
  if (!tenant || !isWhatsappTenantAllowed(tenant.slug, process.env.KAPSO_TENANT_SLUG)) {
    return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
  }

  // 2) Body crudo: la firma se calcula sobre los bytes exactos, no sobre el JSON parseado
  const raw = await req.text();

  if (!verifyKapsoSignature(raw, req.headers.get("x-webhook-signature"))) {
    return new NextResponse("Firma inválida", { status: 401 });
  }

  // 3) Solo nos interesan los mensajes entrantes
  if (req.headers.get("x-webhook-event") !== "whatsapp.message.received") {
    return NextResponse.json({ ok: true, ignorado: true });
  }

  let payload: KapsoPayload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new NextResponse("JSON inválido", { status: 400 });
  }

  // 4) Kapso puede mandar un solo evento o un lote (batch)
  const eventos: KapsoEvent[] = payload?.batch ? payload.data ?? [] : [payload];
  const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID;

  for (const evento of eventos) {
    // Solo eventos del número configurado para esta empresa
    if (!isEventForPhoneNumber(evento, payload, phoneNumberId)) {
      console.warn("[whatsapp-webhook] Evento de otro número ignorado");
      continue;
    }
    try {
      await procesarMensaje(tenant.id, evento);
    } catch (err) {
      console.error("[whatsapp-webhook] Error procesando mensaje", err);
    }
  }

  // 5) Kapso espera 200 en menos de 10 s; si no, reintenta
  return NextResponse.json({ ok: true });
}

async function procesarMensaje(tenantId: string, evento: KapsoEvent) {
  const msg = evento?.message;
  if (!msg || msg?.kapso?.direction === "outbound") return;

  const telefonoRaw: string | undefined = msg.from ?? evento?.conversation?.phone_number;
  if (!telefonoRaw) return;
  const telefono = soloDigitos(telefonoRaw);

  // Solo usuarios de ventas/pricing registrados en el ERP
  const usuario = await buscarUsuarioPorWhatsapp(tenantId, telefono);
  if (!usuario) {
    console.warn(`[whatsapp-webhook] Número no autorizado: ***${telefono.slice(-4)}`);
    return; // se ignora en silencio
  }

  if (msg.type !== "text") {
    await sendWhatsAppText(telefono, "Por ahora solo se reciben solicitudes en texto.\n\n" + FORMATO_AYUDA);
    return;
  }

  const texto: string = msg.text?.body ?? "";

  if (!esSolicitud(texto)) {
    await sendWhatsAppText(telefono, FORMATO_AYUDA);
    return;
  }

  // Si Kapso reintenta el mismo mensaje, no se duplica
  if (await yaProcesado(tenantId, msg.id)) return;

  const { datos, faltantes } = parseSolicitud(texto);

  if (faltantes.length > 0) {
    await sendWhatsAppText(
      telefono,
      `Faltan datos obligatorios: ${faltantes.join(", ")}.\n\nCorrija y envíe de nuevo la solicitud completa.`
    );
    return;
  }

  const solicitud = await crearSolicitudCotizacion({
    ...datos,
    tenantId,
    solicitadoPorId: usuario.id,
    whatsappMessageId: msg.id,
    textoOriginal: texto,
    forzar: esSolicitudNueva(texto),
  });

  if (solicitud.duplicada) {
    await sendWhatsAppText(
      telefono,
      `Ya existe la solicitud ${solicitud.codigo} con los mismos datos. Si es una solicitud distinta, envíela de nuevo empezando con COTIZACION NUEVA.`
    );
    return;
  }

  if (!solicitud.creada) return; // reintento concurrente: ya se respondió

  await sendWhatsAppText(
    telefono,
    [
      `✅ Solicitud ${solicitud.codigo} registrada.`,
      `Cliente: ${datos.cliente}`,
      `${datos.modalidad} | ${datos.origen} → ${datos.destino}`,
      "Pricing ya la tiene en su bandeja.",
    ].join("\n")
  );
}
