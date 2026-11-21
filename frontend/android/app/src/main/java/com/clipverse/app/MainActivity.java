package com.clipverse.app;

import android.os.Build;
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
    // Default status bar: white with dark icons; the web app switches it per page
    window.setStatusBarColor(0xFFFFFFFF);
    new WindowInsetsControllerCompat(window, window.getDecorView()).setAppearanceLightStatusBars(true);
    // Transparent navigation bar: the app draws behind it, with no bar colour or footer of its own
    window.setNavigationBarColor(0x00000000);
    if (Build.VERSION.SDK_INT >= 29) window.setNavigationBarContrastEnforced(false);
    new WindowInsetsControllerCompat(window, window.getDecorView()).setAppearanceLightNavigationBars(true);
    // The web app calls window.RimStatus.setLightBackground(true|false)
    getBridge().getWebView().addJavascriptInterface(new StatusBridge(), "RimStatus");
  }

  private class StatusBridge {
    // true: white status bar with dark icons; false: black status bar with light icons.
    // The navigation bar icons follow the same choice.
    @JavascriptInterface
    public void setLightBackground(final boolean light) {
      runOnUiThread(() -> {
        View decor = getWindow().getDecorView();
        getWindow().setStatusBarColor(light ? 0xFFFFFFFF : 0xFF000000);
        WindowInsetsControllerCompat controller = new WindowInsetsControllerCompat(getWindow(), decor);
        controller.setAppearanceLightStatusBars(light);
        controller.setAppearanceLightNavigationBars(light);
      });
    }
  }
}
