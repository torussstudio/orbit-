'use strict';
const router = require('express').Router();
const { auth } = require('../middleware/auth');
const notificationController = require('../controllers/notificationController');

router.get('/', auth, notificationController.getNotifications);
router.patch('/read-all', auth, notificationController.markAllRead);
router.patch('/:id/read', auth, notificationController.markOneRead);
router.delete('/push-subscribe', auth, notificationController.pushUnsubscribe);
router.delete('/:id', auth, notificationController.deleteNotification);
router.post('/push-subscribe', auth, notificationController.pushSubscribe);
router.get('/vapid-public-key', notificationController.getVapidPublicKey);

module.exports = router;