import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

/**
 * Create Android Notification Channel with maximum importance and sound for incoming calls
 */
export async function createCallNotificationChannel() {
  try {
    if (Capacitor.isNativePlatform()) {
      await LocalNotifications.createChannel({
        id: 'call_channel',
        name: 'Incoming Video & Voice Calls',
        description: 'Loud ringing notifications for incoming Puja group calls',
        importance: 5, // High importance (heads-up pop-up + sound)
        visibility: 1, // Visible on lockscreen
        sound: 'pather_panchali.mp3',
        vibration: true,
        lights: true,
        lightColor: '#ff0055',
      });
    }
  } catch (err) {
    console.warn('[NotificationService] Channel creation warning:', err);
  }
}

/**
 * Request notification permissions from the user on device/browser startup
 */
export async function requestNotificationPermission() {
  try {
    if (Capacitor.isNativePlatform()) {
      const status = await LocalNotifications.checkPermissions();
      if (status.display !== 'granted') {
        const req = await LocalNotifications.requestPermissions();
        await createCallNotificationChannel();
        return req.display === 'granted';
      }
      await createCallNotificationChannel();
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
  channelId = 'call_channel',
}) {
  try {
    if (Capacitor.isNativePlatform()) {
      await createCallNotificationChannel();
      await LocalNotifications.schedule({
        notifications: [
          {
            title: title || 'PujoPlan Alert',
            body: body || '',
            id: Number(id) || Math.floor(Math.random() * 100000),
            schedule: { at: new Date(Date.now() + 50) },
            sound: sound,
            channelId: channelId,
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

