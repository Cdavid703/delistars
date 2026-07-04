import { Router } from 'express';
import { PaymentsController } from '../controllers/payments.controller';
import { requireSignedIn } from '../../../middlewares/require-signed-in';

const router = Router();

// Pago con Wompi. Todos los endpoints exigen sesión de Firebase (cualquier
// usuario firmado, incluye clientes): nada queda abierto sin autenticación.
router.post('/wompi/session', requireSignedIn, PaymentsController.createSession);
router.get('/wompi/verify/:transactionId', requireSignedIn, PaymentsController.verify);
router.get('/wompi/mode', requireSignedIn, PaymentsController.mode);

export default router;
