import { Response } from 'express';
import { SignedInRequest } from '../../../middlewares/require-signed-in';
import { createCheckoutSession, verifyTransaction, isSimulated } from '../services/wompi.service';

export class PaymentsController {
  // POST /payments/wompi/session { orderId, amountInCents, redirectUrl }
  // Genera la referencia y la firma de integridad para el checkout.
  static async createSession(req: SignedInRequest, res: Response) {
    try {
      const { orderId, amountInCents, redirectUrl } = req.body || {};
      const amount = Number(amountInCents);

      if (!orderId || typeof orderId !== 'string' || orderId.length > 64) {
        return res.status(400).json({ success: false, error: 'orderId inválido' });
      }
      // COP en centavos: mínimo $1.000, máximo $5.000.000 por pedido (sanidad).
      if (!Number.isInteger(amount) || amount < 100000 || amount > 500000000) {
        return res.status(400).json({ success: false, error: 'Monto inválido' });
      }
      if (!redirectUrl || typeof redirectUrl !== 'string' || !/^https?:\/\//.test(redirectUrl)) {
        return res.status(400).json({ success: false, error: 'redirectUrl inválida' });
      }

      const session = createCheckoutSession(orderId, amount, redirectUrl);
      return res.json({ success: true, data: session });
    } catch (err) {
      console.error('[payments] createSession error:', err);
      return res.status(500).json({ success: false, error: 'No se pudo crear la sesión de pago' });
    }
  }

  // GET /payments/wompi/verify/:transactionId
  // Consulta el estado REAL de la transacción (Wompi o simulador).
  static async verify(req: SignedInRequest, res: Response) {
    try {
      const { transactionId } = req.params;
      if (!transactionId || transactionId.length > 120) {
        return res.status(400).json({ success: false, error: 'transactionId inválido' });
      }
      const result = await verifyTransaction(transactionId);
      return res.json({ success: true, data: result });
    } catch (err) {
      console.error('[payments] verify error:', err);
      return res.status(500).json({ success: false, error: 'No se pudo verificar la transacción' });
    }
  }

  // GET /payments/wompi/mode — le dice al front si está en modo simulado.
  static mode(_req: SignedInRequest, res: Response) {
    return res.json({ success: true, data: { simulated: isSimulated() } });
  }
}
