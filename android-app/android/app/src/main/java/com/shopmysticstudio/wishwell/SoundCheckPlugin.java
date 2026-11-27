package com.shopmysticstudio.wishwell;

import android.content.Context;
import android.media.AudioManager;
import android.view.HapticFeedbackConstants;
import android.view.View;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Lets the web app skip its sounds when the phone is on silent or vibrate,
// or the media volume is all the way down, and gives it a light buzz on taps.
@CapacitorPlugin(name = "WishwellSound")
public class SoundCheckPlugin extends Plugin {
    @PluginMethod
    public void canPlay(PluginCall call) {
        boolean ok = false;
        AudioManager am = (AudioManager) getContext().getApplicationContext().getSystemService(Context.AUDIO_SERVICE);
        if (am != null) {
            ok = am.getRingerMode() == AudioManager.RINGER_MODE_NORMAL
                && am.getStreamVolume(AudioManager.STREAM_MUSIC) > 0;
        }
        JSObject ret = new JSObject();
        ret.put("ok", ok);
        call.resolve(ret);
    }

    // Haptic tick when an idea is circled, a short buzz when one is cut.
    // Off when the ringer is on silent; the phone's own touch-vibration setting still applies.
    @PluginMethod
    public void haptic(PluginCall call) {
        AudioManager am = (AudioManager) getContext().getApplicationContext().getSystemService(Context.AUDIO_SERVICE);
        if (am != null && am.getRingerMode() == AudioManager.RINGER_MODE_SILENT) {
            call.resolve();
            return;
        }
        final int effect = "cut".equals(call.getString("kind", "tick"))
            ? HapticFeedbackConstants.LONG_PRESS
            : HapticFeedbackConstants.VIRTUAL_KEY;
        getActivity().runOnUiThread(() -> {
            View v = getBridge().getWebView();
            if (v != null) v.performHapticFeedback(effect);
            call.resolve();
        });
    }
}
