package com.roy.puja;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

public class CallActionReceiver extends BroadcastReceiver {
    private static final String TAG = "CallActionReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;

        String action = intent.getAction();
        String groupId = intent.getStringExtra("groupId");
        String groupName = intent.getStringExtra("groupName");
        String callerName = intent.getStringExtra("callerName");
        String callMode = intent.getStringExtra("callMode");
        String callId = intent.getStringExtra("callId");

        Log.d(TAG, "onReceive action: " + action + ", groupId=" + groupId);

        if ("com.roy.puja.ACTION_ANSWER".equals(action)) {
            // 1. Stop ringtone and dismiss notification
            CallNotificationHelper.dismissCall(context);

            // 2. Open MainActivity and trigger call answer
            Intent launchIntent = new Intent(context, MainActivity.class);
            launchIntent.setAction("com.roy.puja.ACTION_ANSWER");
            launchIntent.putExtra("call_action", "answer");
            launchIntent.putExtra("groupId", groupId);
            launchIntent.putExtra("groupName", groupName);
            launchIntent.putExtra("callerName", callerName);
            launchIntent.putExtra("callMode", callMode);
            launchIntent.putExtra("callId", callId);
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            context.startActivity(launchIntent);

        } else if ("com.roy.puja.ACTION_DECLINE".equals(action)) {
            // 1. Stop ringtone and dismiss notification
            CallNotificationHelper.dismissCall(context);

            // 2. Send decline signal to server asynchronously
            if (groupId != null) {
                sendDeclineToServer(context, groupId, callId);
            }
        }
    }

    private void sendDeclineToServer(Context context, String groupId, String callId) {
        new Thread(() -> {
            try {
                SharedPreferences prefs = context.getSharedPreferences("pujoplan_prefs", Context.MODE_PRIVATE);
                String apiUrl = prefs.getString("api_url", "https://uma-asche.onrender.com/api");
                String token = prefs.getString("token", "");
                String userId = prefs.getString("user_id", "");
                String userName = prefs.getString("user_name", "User");

                URL url = new URL(apiUrl + "/calls/signal");
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setRequestProperty("Accept", "application/json");
                if (!token.isEmpty()) {
                    conn.setRequestProperty("Authorization", "Bearer " + token);
                }
                conn.setConnectTimeout(6000);
                conn.setReadTimeout(6000);
                conn.setDoOutput(true);

                JSONObject payload = new JSONObject();
                payload.put("type", "decline");
                payload.put("groupId", groupId);
                payload.put("callId", callId);
                payload.put("reason", "declined_from_notification");

                try (OutputStream os = conn.getOutputStream()) {
                    os.write(payload.toString().getBytes(StandardCharsets.UTF_8));
                }

                int code = conn.getResponseCode();
                Log.d(TAG, "Decline sent to server, HTTP code: " + code);
                conn.disconnect();
            } catch (Exception e) {
                Log.e(TAG, "Failed to send decline signal: " + e.getMessage());
            }
        }).start();
    }
}
