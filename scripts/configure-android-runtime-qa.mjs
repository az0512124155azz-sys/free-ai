import fs from 'node:fs';
import path from 'node:path';

const mainActivity=path.resolve('android/app/src/main/java/com/freeai/mobile/MainActivity.java');
if(!fs.existsSync(mainActivity)){
  console.error('MainActivity.java not found. Configure Android and social login first.');
  process.exit(1);
}

let source=fs.readFileSync(mainActivity,'utf8');
const importAnchor="import android.util.Log;\n";
const extraImports=`import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.IntentFilter;
import android.content.pm.ApplicationInfo;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.inputmethod.InputMethodManager;
import android.webkit.WebView;

import org.json.JSONObject;
`;
if(!source.includes(extraImports)){
  if(!source.includes(importAnchor))throw new Error('MainActivity import anchor not found.');
  source=source.replace(importAnchor,importAnchor+extraImports);
}

const classAnchor='public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {\n';
const qaBlock=`    private static final String QA_ACTION = "com.freeai.mobile.FREEAI_RUNTIME_QA";
    private static final String QA_TAG = "FreeAIAndroidQA";
    private BroadcastReceiver qaReceiver;
    private final Handler qaHandler = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (!isQaDebuggable()) return;

        qaReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String command = intent == null ? "audit" : intent.getStringExtra("command");
                runQaCommand(command == null ? "audit" : command);
            }
        };

        IntentFilter filter = new IntentFilter(QA_ACTION);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(qaReceiver, filter, Context.RECEIVER_EXPORTED);
        } else {
            registerReceiver(qaReceiver, filter);
        }
    }

    @Override
    public void onDestroy() {
        if (qaReceiver != null) {
            try {
                unregisterReceiver(qaReceiver);
            } catch (IllegalArgumentException ignored) {
            }
            qaReceiver = null;
        }
        super.onDestroy();
    }

    private boolean isQaDebuggable() {
        return (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    }

    private void runQaCommand(String command) {
        if (!isQaDebuggable() || getBridge() == null || getBridge().getWebView() == null) {
            Log.i(QA_TAG, command + ":bridge=missing");
            return;
        }

        WebView webView = getBridge().getWebView();
        String script = "window.__FREEAI_ANDROID_QA__ ? window.__FREEAI_ANDROID_QA__("
                + JSONObject.quote(command) + ") : 'qa=missing'";

        webView.post(() -> webView.evaluateJavascript(script, value -> {
            Log.i(QA_TAG, command + ":" + value);
            if ("focusComposer".equals(command)) {
                qaHandler.postDelayed(() -> {
                    webView.requestFocus();
                    InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
                    if (imm != null) imm.showSoftInput(webView, InputMethodManager.SHOW_IMPLICIT);
                }, 150);
            }
        }));
    }

`;

if(!source.includes('private static final String QA_ACTION')){
  if(!source.includes(classAnchor))throw new Error('MainActivity class anchor not found.');
  source=source.replace(classAnchor,classAnchor+qaBlock);
}

fs.writeFileSync(mainActivity,source,'utf8');
console.log('Configured debug-only Android runtime QA bridge.');
