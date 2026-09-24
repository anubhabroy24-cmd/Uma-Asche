package com.roy.puja;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Log;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";
    private static final int PERMISSION_REQ_CODE = 999;

    public class AndroidBridge {
        private final Context mContext;

        AndroidBridge(Context context) {
            mContext = context;
        }

        @JavascriptInterface
        public void saveUserSession(String userId, String token, String name, String apiUrl) {
            Log.d(TAG, "AndroidBridge.saveUserSession for userId: " + userId);
            try {
                SharedPreferences prefs = mContext.getSharedPreferences("pujoplan_prefs", Context.MODE_PRIVATE);
                SharedPreferences.Editor editor = prefs.edit();
                editor.putString("user_id", userId != null ? userId.trim() : "");
                editor.putString("token", token != null ? token.trim() : "");
                editor.putString("user_name", name != null ? name.trim() : "");
                if (apiUrl != null && !apiUrl.trim().isEmpty()) {
                    editor.putString("api_url", apiUrl.trim());
                }
                editor.apply();

                // Start the background call service immediately
                startCallService();

                // Request background battery optimization exemption so calls arrive when app is closed
                runOnUiThread(MainActivity.this::requestBatteryOptimizationExemption);
            } catch (Exception e) {
                Log.e(TAG, "Error saving user session: " + e.getMessage());
            }
        }

        @JavascriptInterface
        public void clearUserSession() {
            Log.d(TAG, "AndroidBridge.clearUserSession");
            try {
                SharedPreferences prefs = mContext.getSharedPreferences("pujoplan_prefs", Context.MODE_PRIVATE);
                prefs.edit().clear().apply();

                Intent serviceIntent = new Intent(mContext, BackgroundCallService.class);
                mContext.stopService(serviceIntent);

                CallNotificationHelper.dismissCall(mContext);
            } catch (Exception e) {
                Log.e(TAG, "Error clearing user session: " + e.getMessage());
            }
        }

        @JavascriptInterface
        public void startCallService() {
            try {
                Intent serviceIntent = new Intent(mContext, BackgroundCallService.class);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    ContextCompat.startForegroundService(mContext, serviceIntent);
                } else {
                    mContext.startService(serviceIntent);
                }
            } catch (Exception e) {
                Log.e(TAG, "Error starting BackgroundCallService: " + e.getMessage());
            }
        }

        @JavascriptInterface
        public void stopRingtone() {
            Log.d(TAG, "AndroidBridge.stopRingtone");
            CallNotificationHelper.stopRingtone();
        }

        @JavascriptInterface
        public void dismissCall() {
            Log.d(TAG, "AndroidBridge.dismissCall");
            CallNotificationHelper.dismissCall(mContext);
        }

        @JavascriptInterface
        public boolean isGpsEnabled() {
            try {
                LocationManager lm = (LocationManager) mContext.getSystemService(Context.LOCATION_SERVICE);
                return lm != null && (lm.isProviderEnabled(LocationManager.GPS_PROVIDER) || lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER));
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public void requestLocationPermissionOrEnableGps() {
            Log.d(TAG, "AndroidBridge.requestLocationPermissionOrEnableGps");
            try {
                runOnUiThread(() -> {
                    // Check fine location permission first
                    if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                        ActivityCompat.requestPermissions(MainActivity.this, new String[]{
                            Manifest.permission.ACCESS_FINE_LOCATION,
                            Manifest.permission.ACCESS_COARSE_LOCATION
                        }, PERMISSION_REQ_CODE);
                    } else {
                        // Permission already granted, but GPS hardware switch may be OFF
                        LocationManager lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
                        boolean isGps = lm != null && (lm.isProviderEnabled(LocationManager.GPS_PROVIDER) || lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER));
                        if (!isGps) {
                            Intent intent = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS);
                            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            startActivity(intent);
                        }
                    }
                });
            } catch (Exception e) {
                Log.e(TAG, "Error requesting location / GPS: " + e.getMessage());
            }
        }

        @JavascriptInterface
        public boolean isBackgroundPermissionGranted() {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    PowerManager pm = (PowerManager) mContext.getSystemService(Context.POWER_SERVICE);
                    return pm != null && pm.isIgnoringBatteryOptimizations(mContext.getPackageName());
                }
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public void requestBackgroundPermission() {
            Log.d(TAG, "AndroidBridge.requestBackgroundPermission");
            runOnUiThread(MainActivity.this::requestBatteryOptimizationExemption);
        }
    }

    public void requestBatteryOptimizationExemption() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                if (pm != null && !pm.isIgnoringBatteryOptimizations(getPackageName())) {
                    Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                    intent.setData(Uri.parse("package:" + getPackageName()));
                    startActivity(intent);
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Error requesting battery optimization exemption: " + e.getMessage());
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        try {
            if (this.bridge != null && this.bridge.getWebView() != null) {
                WebView webView = this.bridge.getWebView();
                WebSettings settings = webView.getSettings();
                settings.setMediaPlaybackRequiresUserGesture(false);
                settings.setDomStorageEnabled(true);
                settings.setDatabaseEnabled(true);
                settings.setGeolocationEnabled(true);
                settings.setGeolocationDatabasePath(getFilesDir().getPath());

                // Expose AndroidBridge to JavaScript
                webView.addJavascriptInterface(new AndroidBridge(this), "AndroidBridge");
            }
        } catch (Exception e) {
            Log.e(TAG, "Error configuring WebView: " + e.getMessage());
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                setShowWhenLocked(true);
                setTurnScreenOn(true);
            } else {
                getWindow().addFlags(
                    WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                    WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD |
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                );
            }
        } catch (Exception ignored) {}

        // Check and request runtime permissions at startup
        checkAndRequestAppPermissions();

        // Handle incoming call action if launched from notification
        handleIncomingCallIntent(getIntent());
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIncomingCallIntent(intent);
    }

    private void handleIncomingCallIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getStringExtra("call_action");
        if ("answer".equals(action)) {
            String groupId = intent.getStringExtra("groupId");
            String callMode = intent.getStringExtra("callMode");
            String callerName = intent.getStringExtra("callerName");
            String callId = intent.getStringExtra("callId");

            // Stop ringtone and dismiss notification immediately
            CallNotificationHelper.dismissCall(this);

            if (this.bridge != null && this.bridge.getWebView() != null) {
                WebView webView = this.bridge.getWebView();
                String js = String.format(
                    "javascript:(function(){" +
                    "  window.dispatchEvent(new CustomEvent('native:answer_call', {" +
                    "    detail: { groupId: '%s', callMode: '%s', callerName: '%s', callId: '%s' }" +
                    "  }));" +
                    "})();",
                    groupId != null ? groupId : "",
                    callMode != null ? callMode : "video",
                    callerName != null ? callerName : "",
                    callId != null ? callId : ""
                );
                webView.post(() -> webView.evaluateJavascript(js, null));
            }
        }
    }

    private void checkAndRequestAppPermissions() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;

        List<String> needed = new ArrayList<>();

        // 1. Notification permission for Android 13+ (Required for incoming call heads-up & alerts)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.POST_NOTIFICATIONS);
            }
        }

        // 2. GPS Location for Pandal Route & Distance
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.ACCESS_FINE_LOCATION);
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        }

        // 3. Audio & Phone Calling (Microphone & Phone state)
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.RECORD_AUDIO);
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.READ_PHONE_STATE);
        }

        if (!needed.isEmpty()) {
            ActivityCompat.requestPermissions(this, needed.toArray(new String[0]), PERMISSION_REQ_CODE);
        } else {
            // Check battery optimization exemption so app can run in background
            requestBatteryOptimizationExemption();
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PERMISSION_REQ_CODE) {
            requestBatteryOptimizationExemption();
        }
    }

    @Override
    public void onPause() {
        super.onPause();
        try {
            // Keep WebView timers running in background so Socket.io and call listeners do not freeze
            if (this.bridge != null && this.bridge.getWebView() != null) {
                this.bridge.getWebView().resumeTimers();
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void onResume() {
        super.onResume();
        try {
            if (this.bridge != null && this.bridge.getWebView() != null) {
                this.bridge.getWebView().resumeTimers();
            }
        } catch (Exception ignored) {}

        // If user came back to the app and permissions are still not granted, ask again!
        checkAndRequestAppPermissions();

        // Check if there is an active session in prefs to ensure background service is running
        try {
            SharedPreferences prefs = getSharedPreferences("pujoplan_prefs", Context.MODE_PRIVATE);
            String userId = prefs.getString("user_id", "");
            if (userId != null && !userId.trim().isEmpty()) {
                Intent serviceIntent = new Intent(this, BackgroundCallService.class);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    ContextCompat.startForegroundService(this, serviceIntent);
                } else {
                    startService(serviceIntent);
                }
            }
        } catch (Exception ignored) {}
    }
}
