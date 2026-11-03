package com.hefzi.legionlogic;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;

/** Hosts the HTML5 game from assets/www. All game rules live in logic.js. */
public class MainActivity extends Activity {
    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true); // localStorage keeps the best score and the saved run
        web.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void exit() { runOnUiThread(MainActivity.this::finish); }
        }, "Android");
        web.loadUrl("file:///android_asset/www/index.html");
        setContentView(web);
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("onBack()", null);
    }

    @Override
    protected void onPause() {
        web.evaluateJavascript("pauseGame()", null); // app switch or screen off pauses the run
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }
}
