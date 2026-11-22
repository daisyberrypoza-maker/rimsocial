package com.clipverse.app;

import android.graphics.Color;
import android.os.Bundle;

import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // The system navigation bar is transparent, so each screen's own colour shows through.
        // The web page uses viewport-fit=cover and env(safe-area-inset-bottom) to keep its tab bar clear of it.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
    }
}
