package com.shopmysticstudio.wishwell;

import android.content.Context;
import android.media.AudioManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Lets the web app skip its sounds when the phone is on silent or vibrate,
// or the media volume is all the way down.
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
}
