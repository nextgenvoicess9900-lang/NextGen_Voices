const express = require('express');
const ctrl = require('../controllers/certificateController');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { doubleCsrfProtection } = require('../middleware/csrf');

const router = express.Router();

// Public — this is what the certificate's QR code points to.
router.get('/verify/:certificateId', ctrl.verifyCertificate);

router.get('/mine', authenticate, authorize('viewer'), ctrl.myCertificates);
router.post('/:id/download-log', authenticate, authorize('viewer'), doubleCsrfProtection, ctrl.logDownload);
router.delete('/:id', authenticate, authorize('admin'), doubleCsrfProtection, ctrl.removeCertificate);

module.exports = router;
