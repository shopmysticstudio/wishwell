package com.shopmysticstudio.wishwell;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SoundCheckPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
