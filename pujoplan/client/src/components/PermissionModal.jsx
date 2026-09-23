import React, { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Bell, MapPin, PhoneCall, Check, ArrowRight, ShieldCheck } from 'lucide-react';
import { requestNotificationPermission, createCallNotificationChannel } from '../services/notificationService';
import { unlockAudio } from '../services/ringtoneService';
import './PermissionModal.css';

export default function PermissionModal() {
  const [isVisible, setIsVisible] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [notifGranted, setNotifGranted] = useState(false);
  const [locGranted, setLocGranted] = useState(false);

  // Check current permission statuses
  const checkStatus = useCallback(async () => {
    let hasNotif = false;
    let hasLoc = false;

    // 1. Check Notifications
    try {
      if (Capacitor.isNativePlatform()) {
        const notifStatus = await LocalNotifications.checkPermissions();
        hasNotif = notifStatus.display === 'granted';
      } else if (typeof window !== 'undefined' && 'Notification' in window) {
        hasNotif = Notification.permission === 'granted';
      }
    } catch (_) {}

    // 2. Check Geolocation
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const geoStatus = await navigator.permissions.query({ name: 'geolocation' });
        hasLoc = geoStatus.state === 'granted';
      } else if (localStorage.getItem('pp_loc_allowed') === 'true') {
        hasLoc = true;
      }
    } catch (_) {}

    setNotifGranted(hasNotif);
    setLocGranted(hasLoc);

    // If both are already granted, completely avoid showing this prompt
    if (hasNotif && hasLoc) {
      setIsVisible(false);
      return true;
    } else {
      // If either is missing, show the prompt
      setIsVisible(true);
      return false;
    }
  }, []);

  // Initial check on mount
  useEffect(() => {
    // Small 800ms delay to let the initial splash screen finish smoothly
    const timer = setTimeout(() => {
      checkStatus();
    }, 800);

    return () => clearTimeout(timer);
  }, [checkStatus]);

  // When user switches apps and comes back, re-check immediately.
  // If user still hasn't granted permissions, prompt again!
  useEffect(() => {
    const handleRecheck = () => {
      checkStatus();
    };

    window.addEventListener('focus', handleRecheck);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        handleRecheck();
      }
    });

    return () => {
      window.removeEventListener('focus', handleRecheck);
    };
  }, [checkStatus]);

  // Handle user granting all permissions
  const handleGrantPermissions = async () => {
    setIsProcessing(true);
    try {
      // 1. Pre-warm & unlock phone ringtone engine on this user gesture
      try {
        unlockAudio();
      } catch (_) {}

      // 2. Request Notification Permission & Setup Loud Call Channel
      try {
        await requestNotificationPermission();
        await createCallNotificationChannel();
      } catch (_) {}

      // 3. Request Geolocation Permission
      if (navigator.geolocation) {
        await new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            () => {
              localStorage.setItem('pp_loc_allowed', 'true');
              resolve(true);
            },
            () => {
              resolve(false);
            },
            { enableHighAccuracy: true, timeout: 6000 }
          );
        });
      }

      // 4. Re-evaluate statuses
      const allDone = await checkStatus();
      if (allDone) {
        setIsVisible(false);
      }
    } catch (err) {
      console.warn('[PermissionModal] Request error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // If already all ok, return null
  if (!isVisible) return null;

  return (
    <div className="perm-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="perm-title">
      <div className="perm-modal-card">
        <div className="perm-modal-header">
          <div className="perm-modal-icon-badge">
            🪔
          </div>
          <h2 id="perm-title" className="perm-modal-title">Permissions Required</h2>
          <p className="perm-modal-subtitle">
            To ring your phone for group calls, navigate pandals, and notify you in real-time, please grant permissions:
          </p>
        </div>

        <div className="perm-items-list">
          {/* Notifications & Phone Ringing */}
          <div className="perm-item">
            <div className="perm-item-icon perm-item-icon--notif">
              <Bell size={18} />
            </div>
            <div className="perm-item-content">
              <div className="perm-item-title">
                <span>Notifications & Call Alert</span>
                <span className={`perm-item-status ${notifGranted ? 'perm-item-status--granted' : 'perm-item-status--needed'}`}>
                  {notifGranted ? 'Granted' : 'Required'}
                </span>
              </div>
              <p className="perm-item-desc">
                Rings your phone like a normal call when your friends start a video or voice call in your group.
              </p>
            </div>
          </div>

          {/* GPS Location */}
          <div className="perm-item">
            <div className="perm-item-icon perm-item-icon--loc">
              <MapPin size={18} />
            </div>
            <div className="perm-item-content">
              <div className="perm-item-title">
                <span>GPS Pandal Navigation</span>
                <span className={`perm-item-status ${locGranted ? 'perm-item-status--granted' : 'perm-item-status--needed'}`}>
                  {locGranted ? 'Granted' : 'Required'}
                </span>
              </div>
              <p className="perm-item-desc">
                Finds the closest pandals to you, calculates metro routes, and coordinates your squad on the map.
              </p>
            </div>
          </div>

          {/* Phone Calling & Ringing Engine */}
          <div className="perm-item">
            <div className="perm-item-icon perm-item-icon--call">
              <PhoneCall size={18} />
            </div>
            <div className="perm-item-content">
              <div className="perm-item-title">
                <span>Phone Ringing & Audio</span>
                <span className="perm-item-status perm-item-status--granted">
                  Active
                </span>
              </div>
              <p className="perm-item-desc">
                Pre-activates loud phone ringtone and microphone for smooth video calling.
              </p>
            </div>
          </div>
        </div>

        <div className="perm-modal-actions">
          <button
            type="button"
            className="perm-btn-allow"
            onClick={handleGrantPermissions}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <span>Activating Permissions…</span>
            ) : (
              <>
                <span>Allow Permissions</span>
                <ArrowRight size={17} />
              </>
            )}
          </button>

          <button
            type="button"
            className="perm-btn-later"
            onClick={() => setIsVisible(false)}
          >
            Not Now (Ask Next Time)
          </button>
        </div>
      </div>
    </div>
  );
}
