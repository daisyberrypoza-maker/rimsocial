package com.clipverse.app;

import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    Window window = getWindow();
    // Draw behind the status bar, so the profile background reaches the top edge
    WindowCompat.setDecorFitsSystemWindows(window, false);
    // Default status bar: black with light icons; the web app switches it per page
    window.setStatusBarColor(0xFF000000);
    // The web app calls window.RimStatus.setLightBackground(true|false)
    getBridge().getWebView().addJavascriptInterface(new StatusBridge(), "RimStatus");
  }

  private class StatusBridge {
    // true: white status bar with dark icons; false: black status bar with light icons
    @JavascriptInterface
    public void setLightBackground(final boolean light) {
      runOnUiThread(() -> {
        View decor = getWindow().getDecorView();
        getWindow().setStatusBarColor(light ? 0xFFFFFFFF : 0xFF000000);
        new WindowInsetsControllerCompat(getWindow(), decor).setAppearanceLightStatusBars(light);
      });
    }
  }
}
