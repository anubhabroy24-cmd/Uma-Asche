package com.roy.puja;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.util.Log;
import androidx.core.app.NotificationCompat;

public class CallNotificationHelper {
    private static final String TAG = "CallNotificationHelper";
    public static final String CALL_CHANNEL_ID = "pujoplan_call_channel_v2";
    public static final int CALL_NOTIFICATION_ID = 8888;
    
    private static MediaPlayer sMediaPlayer = null;
    private static PowerManager.WakeLock sWakeLock = null;

    public static synchronized void showIncomingCall(
            Context context,
            String groupId,
            String groupName,
            String callerName,
            String callMode,
            String callId
    ) {
        Log.d(TAG, "showIncomingCall: groupId=" + groupId + ", caller=" + callerName);

        // 1. Acquire WakeLock to turn on screen and keep CPU awake during ringing
        acquireWakeLock(context);

        // 2. Play the custom Pather Panchali ringtone
        startRingtone(context);

        // 3. Create High-Priority Notification Channel with custom ringtone
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        Uri soundUri = Uri.parse(ContentResolver.SCHEME_ANDROID_RESOURCE + "://" + context.getPackageName() + "/" + R.raw.pather_panchali);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CALL_CHANNEL_ID,
                    "Puja Incoming Calls",
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Incoming video and voice calls from your Puja group");

            // Audio is played exclusively by MediaPlayer on loop; keep channel silent to avoid double ringing
            channel.setSound(null, null);
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[]{0, 800, 400, 800, 400, 800});
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            channel.setBypassDnd(true);
            manager.createNotificationChannel(channel);
        }

        // 4. Intent when user taps the main notification body / Full Screen Intent
        Intent fullScreenIntent = new Intent(context, MainActivity.class);
        fullScreenIntent.setAction("com.roy.puja.INCOMING_CALL");
        fullScreenIntent.putExtra("call_action", "answer");
        fullScreenIntent.putExtra("groupId", groupId);
        fullScreenIntent.putExtra("groupName", groupName);
        fullScreenIntent.putExtra("callerName", callerName);
        fullScreenIntent.putExtra("callMode", callMode);
        fullScreenIntent.putExtra("callId", callId);
        fullScreenIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent fullScreenPendingIntent = PendingIntent.getActivity(
                context,
                1001,
                fullScreenIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        // 5. Answer Action (calls CallActionReceiver)
        Intent answerIntent = new Intent(context, CallActionReceiver.class);
        answerIntent.setAction("com.roy.puja.ACTION_ANSWER");
        answerIntent.putExtra("groupId", groupId);
        answerIntent.putExtra("groupName", groupName);
        answerIntent.putExtra("callerName", callerName);
        answerIntent.putExtra("callMode", callMode);
        answerIntent.putExtra("callId", callId);
        PendingIntent answerPendingIntent = PendingIntent.getBroadcast(
                context,
                1002,
                answerIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        // 6. Decline Action (calls CallActionReceiver)
        Intent declineIntent = new Intent(context, CallActionReceiver.class);
        declineIntent.setAction("com.roy.puja.ACTION_DECLINE");
        declineIntent.putExtra("groupId", groupId);
        declineIntent.putExtra("callId", callId);
        PendingIntent declinePendingIntent = PendingIntent.getBroadcast(
                context,
                1003,
                declineIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        String modeLabel = "voice".equalsIgnoreCase(callMode) ? "Voice Call" : "Video Call";

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CALL_CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("📞 " + callerName + " is calling...")
                .setContentText(groupName + " • " + modeLabel)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setAutoCancel(false)
                .setSilent(true)
                .setVibrate(new long[]{0, 800, 400, 800, 400, 800})
                .setFullScreenIntent(fullScreenPendingIntent, true)
                .setContentIntent(fullScreenPendingIntent)
                .addAction(android.R.drawable.ic_menu_call, "ANSWER", answerPendingIntent)
                .addAction(android.R.drawable.ic_menu_close_clear_cancel, "DECLINE", declinePendingIntent);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                androidx.core.app.Person callerPerson = new androidx.core.app.Person.Builder()
                        .setName(callerName)
                        .setImportant(true)
                        .build();

                NotificationCompat.CallStyle callStyle = NotificationCompat.CallStyle.forIncomingCall(
                        callerPerson,
                        declinePendingIntent,
                        answerPendingIntent
                );
                builder.setStyle(callStyle);
            } catch (Exception ignored) {}
        }

        manager.notify(CALL_NOTIFICATION_ID, builder.build());

        // Attempt direct full screen popup over lockscreen or other apps
        try {
            Intent popIntent = new Intent(context, MainActivity.class);
            popIntent.setAction("com.roy.puja.INCOMING_CALL");
            popIntent.putExtra("call_action", "incoming");
            popIntent.putExtra("groupId", groupId);
            popIntent.putExtra("groupName", groupName);
            popIntent.putExtra("callerName", callerName);
            popIntent.putExtra("callMode", callMode);
            popIntent.putExtra("callId", callId);
            popIntent.addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK |
                Intent.FLAG_ACTIVITY_CLEAR_TOP |
                Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
            );
            context.startActivity(popIntent);
        } catch (Exception ignored) {}
    }

    public static synchronized void dismissCall(Context context) {
        Log.d(TAG, "dismissCall");
        stopRingtone();
        releaseWakeLock();

        try {
            NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) {
                manager.cancel(CALL_NOTIFICATION_ID);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error cancelling call notification: " + e.getMessage());
        }
    }

    public static synchronized void startRingtone(Context context) {
        try {
            if (sMediaPlayer != null) {
                if (sMediaPlayer.isPlaying()) return;
                sMediaPlayer.release();
                sMediaPlayer = null;
            }

            sMediaPlayer = MediaPlayer.create(context, R.raw.pather_panchali);
            if (sMediaPlayer != null) {
                sMediaPlayer.setAudioAttributes(new AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .build());
                sMediaPlayer.setLooping(true);
                sMediaPlayer.start();
                Log.d(TAG, "Pather Panchali ringtone started successfully.");
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to start ringtone: " + e.getMessage());
        }
    }

    public static synchronized void stopRingtone() {
        try {
            if (sMediaPlayer != null) {
                if (sMediaPlayer.isPlaying()) {
                    sMediaPlayer.stop();
                }
                sMediaPlayer.release();
                sMediaPlayer = null;
                Log.d(TAG, "Ringtone stopped.");
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to stop ringtone: " + e.getMessage());
        }
    }

    private static void acquireWakeLock(Context context) {
        try {
            if (sWakeLock == null) {
                PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
                if (pm != null) {
                    sWakeLock = pm.newWakeLock(
                            PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP,
                            "pujoplan:CallWakeLock"
                    );
                }
            }
            if (sWakeLock != null && !sWakeLock.isHeld()) {
                sWakeLock.acquire(60 * 1000L); // Max 60 seconds
            }
        } catch (Exception e) {
            Log.e(TAG, "WakeLock error: " + e.getMessage());
        }
    }

    private static void releaseWakeLock() {
        try {
            if (sWakeLock != null && sWakeLock.isHeld()) {
                sWakeLock.release();
                sWakeLock = null;
            }
        } catch (Exception ignored) {}
    }
}
