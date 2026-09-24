package com.roy.puja;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.SystemClock;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

public class BackgroundCallService extends Service {
    private static final String TAG = "BackgroundCallService";
    private static final String MONITOR_CHANNEL_ID = "pujoplan_call_monitor_channel";
    private static final int MONITOR_NOTIFICATION_ID = 7777;

    private ScheduledExecutorService mScheduler;
    private String mCurrentRingingCallId = null;
    private boolean mIsPolling = false;

    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "BackgroundCallService onCreate");
        startForegroundMonitor();
        startPolling();
    }

    private void startForegroundMonitor() {
        try {
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationChannel channel = new NotificationChannel(
                        MONITOR_CHANNEL_ID,
                        "Puja Call Service",
                        NotificationManager.IMPORTANCE_MIN
                );
                channel.setDescription("Background monitor for incoming Puja calls");
                channel.setShowBadge(false);
                channel.setSound(null, null);
                manager.createNotificationChannel(channel);
            }

            Intent notificationIntent = new Intent(this, MainActivity.class);
            PendingIntent pendingIntent = PendingIntent.getActivity(
                    this,
                    0,
                    notificationIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
            );

            Notification notification = new NotificationCompat.Builder(this, MONITOR_CHANNEL_ID)
                    .setContentTitle("Uma Asche Active")
                    .setContentText("Listening for group calls")
                    .setSmallIcon(R.mipmap.ic_launcher)
                    .setPriority(NotificationCompat.PRIORITY_MIN)
                    .setContentIntent(pendingIntent)
                    .setSilent(true)
                    .setOngoing(true)
                    .build();

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                // Android 14+ (API 34) requires explicit foreground service type
                startForeground(MONITOR_NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(MONITOR_NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
            } else {
                startForeground(MONITOR_NOTIFICATION_ID, notification);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error in startForegroundMonitor: " + e.getMessage());
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForegroundMonitor();
        if (mScheduler == null || mScheduler.isShutdown()) {
            startPolling();
        }
        return START_STICKY;
    }

    private synchronized void startPolling() {
        if (mIsPolling) return;
        mIsPolling = true;

        mScheduler = Executors.newSingleThreadScheduledExecutor();
        // Poll every 2.5 seconds
        mScheduler.scheduleWithFixedDelay(this::checkActiveCalls, 1, 2500, TimeUnit.MILLISECONDS);
        Log.d(TAG, "Background call polling started.");
    }

    private void checkActiveCalls() {
        try {
            SharedPreferences prefs = getSharedPreferences("pujoplan_prefs", Context.MODE_PRIVATE);
            String userId = prefs.getString("user_id", "");
            if (userId == null || userId.trim().isEmpty()) {
                // No logged-in user, nothing to check
                return;
            }

            String apiUrl = prefs.getString("api_url", "https://uma-asche.onrender.com/api");
            String token = prefs.getString("token", "");

            String endpoint = apiUrl + "/calls/check-active?userId=" + URLEncoder.encode(userId, "UTF-8");
            URL url = new URL(endpoint);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("Accept", "application/json");
            if (token != null && !token.isEmpty()) {
                conn.setRequestProperty("Authorization", "Bearer " + token);
            }
            conn.setConnectTimeout(4000);
            conn.setReadTimeout(4000);

            int code = conn.getResponseCode();
            if (code == 200) {
                BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line);
                }
                reader.close();

                JSONObject res = new JSONObject(sb.toString());
                boolean hasCall = res.optBoolean("hasCall", false);

                if (hasCall) {
                    JSONObject callObj = res.optJSONObject("call");
                    if (callObj != null) {
                        String callId = callObj.optString("callId", "");
                        String groupId = callObj.optString("groupId", "");
                        String groupName = callObj.optString("groupName", "Puja Group");
                        String callerName = callObj.optString("callerName", "Friend");
                        String callMode = callObj.optString("callMode", "video");

                        if (!callId.isEmpty() && !callId.equals(mCurrentRingingCallId)) {
                            Log.d(TAG, "Detected new active call: " + callId + " from " + callerName);
                            mCurrentRingingCallId = callId;
                            CallNotificationHelper.showIncomingCall(
                                    getApplicationContext(),
                                    groupId,
                                    groupName,
                                    callerName,
                                    callMode,
                                    callId
                            );
                        }
                    }
                } else {
                    // No active call. If we were ringing, dismiss it now
                    if (mCurrentRingingCallId != null) {
                        Log.d(TAG, "Active call ended on server. Dismissing ringtone.");
                        mCurrentRingingCallId = null;
                        CallNotificationHelper.dismissCall(getApplicationContext());
                    }
                }
            }
            conn.disconnect();
        } catch (Exception e) {
            // Silently ignore transient network glitches
        }
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
        Log.d(TAG, "App task removed (swiped away). Rescheduling BackgroundCallService...");
        // Re-arm service via AlarmManager so Android restarts it when swiped away
        try {
            Intent restartServiceIntent = new Intent(getApplicationContext(), BackgroundCallService.class);
            PendingIntent restartPendingIntent = PendingIntent.getService(
                    getApplicationContext(),
                    1,
                    restartServiceIntent,
                    PendingIntent.FLAG_ONE_SHOT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
            );
            AlarmManager alarmService = (AlarmManager) getApplicationContext().getSystemService(Context.ALARM_SERVICE);
            if (alarmService != null) {
                alarmService.set(
                        AlarmManager.ELAPSED_REALTIME,
                        SystemClock.elapsedRealtime() + 1000,
                        restartPendingIntent
                );
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to reschedule service on task remove: " + e.getMessage());
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        Log.d(TAG, "BackgroundCallService onDestroy");
        if (mScheduler != null) {
            mScheduler.shutdownNow();
            mScheduler = null;
        }
        mIsPolling = false;
        if (mCurrentRingingCallId != null) {
            CallNotificationHelper.dismissCall(getApplicationContext());
            mCurrentRingingCallId = null;
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
