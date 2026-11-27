package com.shopmysticstudio.wishwell;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.os.Build;
import android.os.VibrationAttributes;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.view.HapticFeedbackConstants;
import android.view.View;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Lets the web app skip its sounds when the phone is on silent or vibrate,
// or the media volume is all the way down, and buzzes when an idea is circled or cut.
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

    // Circle: a quick rising buzz (three pulses, each longer and stronger).
    // Cut: a firm double pulse, like a pair of scissors closing.
    // Off when the ringer is on silent. On Android 13 and later it also follows the phone's
    // own touch vibration setting. The app's mute button stops the call before it gets here.
    private static final long[] CIRCLE_TIMES = {0, 25, 35, 35, 35, 60};
    private static final int[] CIRCLE_AMPS = {0, 90, 0, 170, 0, 255};
    private static final long[] CUT_TIMES = {0, 55, 70, 55};
    private static final int[] CUT_AMPS = {0, 255, 0, 255};

    @PluginMethod
    public void haptic(PluginCall call) {
        Context ctx = getContext().getApplicationContext();
        AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
        if (am != null && am.getRingerMode() == AudioManager.RINGER_MODE_SILENT) {
            call.resolve();
            return;
        }
        boolean cut = "cut".equals(call.getString("kind", "tick"));
        try {
            Vibrator vib;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager vm = (VibratorManager) ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                vib = vm != null ? vm.getDefaultVibrator() : null;
            } else {
                vib = (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
            }
            if (vib != null && vib.hasVibrator() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                long[] times = cut ? CUT_TIMES : CIRCLE_TIMES;
                VibrationEffect effect = vib.hasAmplitudeControl()
                    ? VibrationEffect.createWaveform(times, cut ? CUT_AMPS : CIRCLE_AMPS, -1)
                    : VibrationEffect.createWaveform(times, -1);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    vib.vibrate(effect, VibrationAttributes.createForUsage(VibrationAttributes.USAGE_TOUCH));
                } else {
                    vib.vibrate(effect, new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
                }
                call.resolve();
                return;
            }
        } catch (Exception e) {
            // fall back to the WebView's built-in tap feedback below
        }
        // Android 7 or no vibration motor access: the phone's standard tap feedback.
        final int fallback = cut ? HapticFeedbackConstants.LONG_PRESS : HapticFeedbackConstants.VIRTUAL_KEY;
        if (getActivity() == null) { // app closing: nothing to buzz
            call.resolve();
            return;
        }
        getActivity().runOnUiThread(() -> {
            View v = getBridge().getWebView();
            if (v != null) v.performHapticFeedback(fallback);
            call.resolve();
        });
    }
}
