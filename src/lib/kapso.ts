import crypto from "node:crypto";

const KAPSO_WHATSAPP_API = "https://api.kapso.ai/meta/whatsapp/v24.0";

/**
 * Verifica que el webhook venga realmente de Kapso.
 * Kapso firma el body crudo con HMAC-SHA256 (hex) usando el secret_key del webhook
 * y lo envía en el header X-Webhook-Signature.
 */
export function verifyKapsoSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.KAPSO_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signature.trim().replace(/^sha256=/, ""), "hex");

  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Envía un mensaje de texto por WhatsApp.
 * Solo funciona sin plantilla dentro de las 24 h desde el último mensaje del usuario.
 */
export async function sendWhatsAppText(to: string, body: string) {
  const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID;
  const apiKey = process.env.KAPSO_API_KEY;
  if (!phoneNumberId || !apiKey) {
    throw new Error("Faltan las variables KAPSO_PHONE_NUMBER_ID o KAPSO_API_KEY");
  }

  const res = await fetch(`${KAPSO_WHATSAPP_API}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    }),
  });

  if (!res.ok) {
    throw new Error(`Kapso respondió ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

/** Deja solo los dígitos de un teléfono: "+504 9999-8888" -> "50499998888" */
export function soloDigitos(telefono: string): string {
  return telefono.replace(/\D/g, "");
}
