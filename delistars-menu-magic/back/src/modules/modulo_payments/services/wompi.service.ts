import crypto from 'crypto';

// ─── Configuración Wompi ─────────────────────────────────────────────────────
// Sin llaves configuradas el módulo arranca en MODO SIMULADO: mismo flujo de
// código, pero sin llamar a los servidores de Wompi (útil para desarrollar
// sin cuenta). Con llaves de sandbox/producción en el .env, este mismo código
// usa el checkout real sin cambiar nada más. Ver PLAN-WOMPI.md.
const WOMPI_API_URL = process.env.WOMPI_API_URL || 'https://sandbox.wompi.co/v1';
const WOMPI_PUBLIC_KEY = process.env.WOMPI_PUBLIC_KEY || '';
const WOMPI_INTEGRITY_SECRET = process.env.WOMPI_INTEGRITY_SECRET || '';

export const isSimulated = (): boolean =>
  process.env.WOMPI_SIMULATED === 'true' || !WOMPI_PUBLIC_KEY || !WOMPI_INTEGRITY_SECRET;

export interface CheckoutSession {
  simulated: boolean;
  reference: string;
  amountInCents: number;
  currency: 'COP';
  publicKey: string;
  integritySignature: string;
  checkoutUrl: string; // https://checkout.wompi.co/p/?public-key=...
}

export interface VerifiedTransaction {
  transactionId: string;
  status: 'APPROVED' | 'DECLINED' | 'PENDING' | 'ERROR' | 'VOIDED';
  amountInCents: number;
  reference: string;
  simulated: boolean;
}

// La referencia amarra la transacción al pedido: <orderId>-<timestamp>.
// El timestamp permite reintentar el pago del mismo pedido (Wompi exige
// referencia única por transacción).
export const buildReference = (orderId: string): string =>
  `${orderId}-${Date.now()}`;

export const referenceToOrderId = (reference: string): string =>
  reference.replace(/-\d+$/, '');

// Firma de integridad de Wompi: SHA-256(reference + amountInCents + currency
// + secreto). Impide que el monto se altere en el navegador.
export function integritySignature(reference: string, amountInCents: number, currency = 'COP'): string {
  return crypto
    .createHash('sha256')
    .update(`${reference}${amountInCents}${currency}${WOMPI_INTEGRITY_SECRET}`)
    .digest('hex');
}

export function createCheckoutSession(orderId: string, amountInCents: number, redirectUrl: string): CheckoutSession {
  const reference = buildReference(orderId);
  const currency = 'COP' as const;

  if (isSimulated()) {
    // Modo desarrollo sin cuenta Wompi: el front detecta simulated=true y
    // muestra el simulador de pago en vez de redirigir.
    return {
      simulated: true,
      reference,
      amountInCents,
      currency,
      publicKey: 'pub_test_SIMULADO',
      integritySignature: 'simulado',
      checkoutUrl: '',
    };
  }

  const signature = integritySignature(reference, amountInCents, currency);
  const params = new URLSearchParams({
    'public-key': WOMPI_PUBLIC_KEY,
    currency,
    'amount-in-cents': String(amountInCents),
    reference,
    'signature:integrity': signature,
    'redirect-url': redirectUrl,
  });
  return {
    simulated: false,
    reference,
    amountInCents,
    currency,
    publicKey: WOMPI_PUBLIC_KEY,
    integritySignature: signature,
    checkoutUrl: `https://checkout.wompi.co/p/?${params.toString()}`,
  };
}

// Verifica una transacción. La palabra final SIEMPRE la da esta consulta
// (la caja y el cliente confían en esto, nunca en el navegador).
//
// En modo simulado el "id" viene del simulador con el formato
// SIM-<APPROVED|DECLINED>-<amountInCents>-<reference> y se decodifica local.
export async function verifyTransaction(transactionId: string): Promise<VerifiedTransaction> {
  const sim = transactionId.match(/^SIM-(APPROVED|DECLINED)-(\d+)-(.+)$/);
  if (sim) {
    if (!isSimulated()) {
      // Con llaves reales configuradas, los ids del simulador no valen:
      // evita que un id falso "SIM-..." pase como pago verificado.
      return { transactionId, status: 'ERROR', amountInCents: 0, reference: '', simulated: true };
    }
    return {
      transactionId,
      status: sim[1] as 'APPROVED' | 'DECLINED',
      amountInCents: Number(sim[2]) || 0,
      reference: sim[3],
      simulated: true,
    };
  }

  const res = await fetch(`${WOMPI_API_URL}/transactions/${encodeURIComponent(transactionId)}`);
  if (!res.ok) {
    return { transactionId, status: 'ERROR', amountInCents: 0, reference: '', simulated: false };
  }
  const body = (await res.json()) as {
    data?: { id: string; status: string; amount_in_cents: number; reference: string };
  };
  const t = body.data;
  if (!t) {
    return { transactionId, status: 'ERROR', amountInCents: 0, reference: '', simulated: false };
  }
  const status = (['APPROVED', 'DECLINED', 'PENDING', 'VOIDED'].includes(t.status) ? t.status : 'ERROR') as VerifiedTransaction['status'];
  return {
    transactionId: t.id,
    status,
    amountInCents: t.amount_in_cents,
    reference: t.reference,
    simulated: false,
  };
}
