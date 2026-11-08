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
    window.setStatusBarColor(0x00000000);
    // The web app calls window.RimStatus.setLightBackground(true|false)
    getBridge().getWebView().addJavascriptInterface(new StatusBridge(), "RimStatus");
  }

  private class StatusBridge {
    // true: the page behind the status bar is light, so the icons are dark
    @JavascriptInterface
    public void setLightBackground(final boolean light) {
      runOnUiThread(() -> {
        View decor = getWindow().getDecorView();
        new WindowInsetsControllerCompat(getWindow(), decor).setAppearanceLightStatusBars(light);
      });
    }
  }
}
