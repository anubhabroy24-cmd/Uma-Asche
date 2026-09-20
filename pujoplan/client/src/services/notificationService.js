import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

/**
 * Request notification permissions from the user on device/browser startup
 */
export async function requestNotificationPermission() {
  try {
    if (Capacitor.isNativePlatform()) {
      const status = await LocalNotifications.checkPermissions();
      if (status.display !== 'granted') {
        const req = await LocalNotifications.requestPermissions();
        return req.display === 'granted';
      }
      return true;
    } else if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        const perm = await Notification.requestPermission();
        return perm === 'granted';
      }
      return Notification.permission === 'granted';
    }
  } catch (err) {
    console.warn('[NotificationService] Permission check failed:', err);
  }
  return false;
}

/**
 * Show a local push notification on the mobile device or web browser
 */
export async function showMobileNotification({
  title,
  body,
  id = Date.now() % 100000,
  extra = {},
  iconColor = '#ea4335',
  sound = 'default',
}) {
  try {
    if (Capacitor.isNativePlatform()) {
      await LocalNotifications.schedule({
        notifications: [
          {
            title: title || 'PujoPlan Alert',
            body: body || '',
            id: Number(id) || Math.floor(Math.random() * 100000),
            schedule: { at: new Date(Date.now() + 100) },
            sound: sound,
            iconColor: iconColor,
            extra: extra,
          },
        ],
      });
    } else if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(title || 'PujoPlan Alert', {
        body: body || '',
        icon: '/favicon.ico',
        tag: String(id),
      });
    }
  } catch (err) {
    console.warn('[NotificationService] Failed to schedule notification:', err);
  }
}
