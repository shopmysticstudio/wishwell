package com.shopmysticstudio.wishwell;

import android.graphics.Color;
import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import androidx.activity.SystemBarStyle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SoundCheckPlugin.class);
        super.onCreate(savedInstanceState);
        // Draw edge to edge on every Android version, the way Android 15 and later do by default.
        // Transparent bars with light icons; Capacitor's SystemBars then pads the app by the status bar,
        // navigation bar and notch insets, and the window background (navy, like the header) fills those strips.
        EdgeToEdge.enable(this, SystemBarStyle.dark(Color.TRANSPARENT), SystemBarStyle.dark(Color.TRANSPARENT));
    }
}
