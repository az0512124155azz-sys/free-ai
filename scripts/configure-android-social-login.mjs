import fs from 'node:fs';
import path from 'node:path';

const mainActivity=path.resolve('android/app/src/main/java/com/freeai/mobile/MainActivity.java');
const nativeWindowPlugin=path.resolve('android/app/src/main/java/com/freeai/mobile/FreeAINativeWindowPlugin.java');

if(!fs.existsSync(mainActivity)){
  console.error('MainActivity.java not found. Run "npx cap add android" and "npx cap sync android" first.');
  process.exit(1);
}

const source=`package com.freeai.mobile;

import android.content.Intent;
import android.os.Bundle;
import android.util.Log;

import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginHandle;

import ee.forgr.capacitor.social.login.GoogleProvider;
import ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;
import ee.forgr.capacitor.social.login.SocialLoginPlugin;

public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(FreeAINativeWindowPlugin.class);
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    }

    @Override
    public void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode >= GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MIN
                && requestCode < GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MAX) {
            PluginHandle pluginHandle = getBridge().getPlugin("SocialLogin");
            if (pluginHandle == null) {
                Log.i("Google Activity Result", "SocialLogin login handle is null");
                return;
            }

            Plugin plugin = pluginHandle.getInstance();
            if (!(plugin instanceof SocialLoginPlugin)) {
                Log.i("Google Activity Result", "SocialLogin plugin instance is not SocialLoginPlugin");
                return;
            }

            ((SocialLoginPlugin) plugin).handleGoogleLoginIntent(requestCode, data);
        }
    }

    @Override
    public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {
        // Required marker for @capgo/capacitor-social-login.
    }
}
`;

const nativeWindowSource=`package com.freeai.mobile;

import android.graphics.Color;
import android.os.Build;
import android.view.View;
import android.view.Window;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "FreeAINativeWindow")
public class FreeAINativeWindowPlugin extends Plugin {
    @PluginMethod
    public void setThemeBackground(PluginCall call) {
        String theme = call.getString("theme", "dark");
        boolean light = "light".equals(theme);
        int color = Color.parseColor(light ? "#FFFFFF" : "#181818");

        if (getActivity() == null) {
            call.reject("Activity unavailable");
            return;
        }

        getActivity().runOnUiThread(() -> {
            try {
                Window window = getActivity().getWindow();
                window.getDecorView().setBackgroundColor(color);

                if (getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().getWebView().setBackgroundColor(color);
                    if (getBridge().getWebView().getParent() instanceof View) {
                        ((View) getBridge().getWebView().getParent()).setBackgroundColor(color);
                    }
                }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    window.setNavigationBarContrastEnforced(false);
                }

                call.resolve();
            } catch (Exception error) {
                call.reject("Failed to update native theme background: " + error.getMessage());
            }
        });
    }
}
`;

fs.writeFileSync(mainActivity,source,'utf8');
fs.writeFileSync(nativeWindowPlugin,nativeWindowSource,'utf8');
console.log('Configured MainActivity and native theme background bridge for Google Credential Manager login.');
