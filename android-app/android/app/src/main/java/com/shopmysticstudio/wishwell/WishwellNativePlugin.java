package com.shopmysticstudio.wishwell;

import android.content.Context;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mediapipe.tasks.components.containers.Embedding;
import com.google.mediapipe.tasks.core.BaseOptions;
import com.google.mediapipe.tasks.text.textembedder.TextEmbedder;
import com.google.mediapipe.tasks.text.textembedder.TextEmbedderResult;
import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;

/*
 * Wishwell's native helpers for the web screens.
 *
 * 1. Scoring by meaning: Google's MediaPipe Text Embedder (Universal Sentence Encoder, bundled in
 *    assets/models) turns each idea and each of the person's signals (interests, Details, kept and
 *    cut ideas) into a vector. Ideas close to what they like and far from what they cut score higher.
 *    Idea vectors are cached in the app's files, so after the first run only the signals are embedded.
 *    Everything runs on the phone; nothing is sent anywhere.
 * 2. Saved lists: a copy of the open list and any saved lists in the app's own files, so they survive
 *    the web view's storage being cleared and reopen with no network.
 */
@CapacitorPlugin(name = "WishwellNative")
public class WishwellNativePlugin extends Plugin {
    private static final String MODEL = "models/use.tflite";
    private static final String CACHE = "emb-cache-v2.bin";
    /**
     * This model's vectors all point roughly the same way, so raw closeness is about 0.76 even for
     * unrelated gift ideas. Taking away this average vector (the same one the website uses) and
     * normalizing again puts unrelated ideas near 0 and a clear match at 0.3 and up.
     */
    private static final float[] MEAN = {0.1361f, -0.0323f, -0.0621f, 0.1438f, 0.0423f, 0.0634f, -0.1085f, -0.1528f, 0.2101f, 0.0053f, -0.0803f, -0.0659f, 0.1199f, -0.173f, 0.1259f, 0.1119f, -0.0153f, -0.0632f, -0.0048f, -0.1244f, -0.1228f, 0.1087f, 0.0916f, -0.0277f, 0.11f, 0.117f, 0.0068f, -0.1162f, 0.0203f, 0.0694f, -0.036f, -0.1117f, -0.012f, -0.0157f, 0.0241f, 0.0886f, -0.0658f, -0.0553f, -0.0091f, 0.0046f, -0.0634f, 0.073f, 0.101f, 0.1054f, -0.0695f, 0.0786f, -0.0936f, 0.1185f, 0.0864f, 0.0125f, -0.0441f, 0.1266f, 0.0715f, 0.061f, 0.0881f, 0.0417f, 0.0467f, 0.0589f, 0.0102f, 0.1515f, -0.0828f, -0.133f, 0.1277f, 0.0335f, 0.0192f, 0.1955f, -0.0225f, 0.0044f, -0.0316f, 0.1089f, -0.007f, -0.0567f, -0.0651f, 0.0044f, -0.0246f, -0.1164f, 0.1023f, -0.0205f, 0.0227f, 0.0116f, 0.1023f, -0.0321f, 0.1216f, 0.01f, -0.0486f, 0.04f, 0.2687f, 0.0436f, -0.098f, 0.0127f, -0.1339f, 0.0269f, -0.063f, -0.1799f, -0.0712f, 0.0202f, 0.1166f, 0.112f, 0.0181f, -0.0327f};
    private final ExecutorService work = Executors.newSingleThreadExecutor();
    private TextEmbedder embedder;
    private boolean failed = false;
    private final Map<String, float[]> cache = new HashMap<>();
    private boolean cacheLoaded = false;
    private boolean cacheDirty = false;

    @Override
    protected void handleOnDestroy() {
        work.shutdown();
    }

    private synchronized TextEmbedder emb() {
        if (embedder != null || failed) return embedder;
        try {
            BaseOptions base = BaseOptions.builder().setModelAssetPath(MODEL).build();
            TextEmbedder.TextEmbedderOptions opts = TextEmbedder.TextEmbedderOptions.builder()
                .setBaseOptions(base).setL2Normalize(true).build();
            embedder = TextEmbedder.createFromOptions(getContext(), opts);
        } catch (Throwable t) {
            failed = true;
        }
        return embedder;
    }

    private float[] vec(String text) {
        float[] v = cache.get(text);
        if (v != null) return v;
        TextEmbedder e = emb();
        if (e == null) return null;
        TextEmbedderResult r = e.embed(text);
        Embedding em = r.embeddingResult().embeddings().get(0);
        float[] raw = em.floatEmbedding();
        v = new float[raw.length];
        for (int i = 0; i < raw.length; i++) v[i] = raw[i] - (i < MEAN.length ? MEAN[i] : 0f);
        // Back to unit length after centering.
        double n = 0;
        for (float x : v) n += x * x;
        n = Math.sqrt(n);
        if (n > 0) for (int i = 0; i < v.length; i++) v[i] /= (float) n;
        cache.put(text, v);
        cacheDirty = true;
        return v;
    }

    private static float dot(float[] a, float[] b) {
        int n = Math.min(a.length, b.length);
        float s = 0;
        for (int i = 0; i < n; i++) s += a[i] * b[i];
        return s;
    }

    private void loadCache() {
        if (cacheLoaded) return;
        cacheLoaded = true;
        File f = new File(getContext().getFilesDir(), CACHE);
        if (!f.exists()) return;
        try (DataInputStream in = new DataInputStream(new BufferedInputStream(new FileInputStream(f)))) {
            int count = in.readInt();
            for (int i = 0; i < count; i++) {
                String k = in.readUTF();
                int d = in.readInt();
                if (d <= 0 || d > 4096) throw new IllegalStateException("bad cache");
                float[] v = new float[d];
                for (int j = 0; j < d; j++) v[j] = in.readFloat();
                cache.put(k, v);
            }
        } catch (Exception e) {
            cache.clear();
            f.delete();
        }
    }

    private void saveCache() {
        if (!cacheDirty) return;
        File f = new File(getContext().getFilesDir(), CACHE);
        File tmp = new File(getContext().getFilesDir(), CACHE + ".tmp");
        try (DataOutputStream out = new DataOutputStream(new BufferedOutputStream(new FileOutputStream(tmp)))) {
            out.writeInt(cache.size());
            for (Map.Entry<String, float[]> e : cache.entrySet()) {
                out.writeUTF(e.getKey());
                out.writeInt(e.getValue().length);
                for (float x : e.getValue()) out.writeFloat(x);
            }
        } catch (Exception e) {
            tmp.delete();
            return;
        }
        if (tmp.renameTo(f)) cacheDirty = false;
    }

    /** Embeds the starter ideas in the background so the first scored round is quick. */
    @PluginMethod
    public void warm(PluginCall call) {
        final JSArray texts = call.getArray("texts", new JSArray());
        call.resolve();
        work.execute(() -> {
            loadCache();
            try {
                for (int i = 0; i < texts.length(); i++) {
                    String t = texts.getString(i);
                    if (t != null && !t.isEmpty()) vec(t);
                    if (i % 100 == 99) saveCache();
                }
            } catch (Throwable ignored) {
                // a bad entry or a model problem: score() reports ready:false and the page uses words only
            }
            saveCache();
        });
    }

    /**
     * items: [[key, text], ...]; pos: [[text, weight 0 to 1], ...]; neg: [text, ...]; own: [text, ...].
     * Returns s: {key: [p, n, o, b, bc]}: p is how close the idea is to the likes (centered on the average
     * idea), n is its closeness to the nearest cut idea, o to the nearest thing they already have, b is the
     * index in pos of the like it is closest to (-1 for none) and bc that closeness.
     */
    @PluginMethod
    public void score(PluginCall call) {
        final JSArray items = call.getArray("items", new JSArray());
        final JSArray pos = call.getArray("pos", new JSArray());
        final JSArray neg = call.getArray("neg", new JSArray());
        final JSArray own = call.getArray("own", new JSArray());
        work.execute(() -> {
            JSObject ret = new JSObject();
            try {
                long t0 = System.currentTimeMillis();
                loadCache();
                if (emb() == null) {
                    ret.put("ready", false);
                    call.resolve(ret);
                    return;
                }
                List<float[]> pv = new ArrayList<>();
                List<Float> pw = new ArrayList<>();
                List<Integer> pi = new ArrayList<>();
                for (int i = 0; i < pos.length(); i++) {
                    JSONArray p = pos.getJSONArray(i);
                    String t = p.getString(0);
                    if (t == null || t.trim().isEmpty()) continue;
                    float[] v = vec(t);
                    if (v == null) continue;
                    pv.add(v);
                    pi.add(i);
                    pw.add((float) Math.max(0.05, Math.min(1.0, p.optDouble(1, 1.0))));
                }
                List<float[]> nv = new ArrayList<>();
                for (int i = 0; i < neg.length(); i++) {
                    String t = neg.getString(i);
                    if (t == null || t.trim().isEmpty()) continue;
                    float[] v = vec(t);
                    if (v != null) nv.add(v);
                }
                List<float[]> ov = new ArrayList<>();
                for (int i = 0; i < own.length(); i++) {
                    String t = own.getString(i);
                    if (t == null || t.trim().isEmpty()) continue;
                    float[] v = vec(t);
                    if (v != null) ov.add(v);
                }
                int n = items.length();
                String[] keys = new String[n];
                float[] ps = new float[n];
                float[] ns = new float[n];
                float[] os = new float[n];
                int[] bi = new int[n];
                float[] bc = new float[n];
                float sum = 0;
                float[] top = new float[3];
                for (int i = 0; i < n; i++) {
                    JSONArray it = items.getJSONArray(i);
                    keys[i] = it.getString(0);
                    float[] v = vec(it.getString(1));
                    bi[i] = -1;
                    if (v == null) continue;
                    Arrays.fill(top, -1f);
                    for (int j = 0; j < pv.size(); j++) {
                        float raw = dot(v, pv.get(j));
                        if (raw > bc[i]) { bc[i] = raw; bi[i] = pi.get(j); }
                        float c = raw * pw.get(j);
                        if (c > top[0]) { top[2] = top[1]; top[1] = top[0]; top[0] = c; }
                        else if (c > top[1]) { top[2] = top[1]; top[1] = c; }
                        else if (c > top[2]) top[2] = c;
                    }
                    int k = Math.min(3, pv.size());
                    float p = 0;
                    for (int j = 0; j < k; j++) p += top[j];
                    ps[i] = k > 0 ? p / k : 0;
                    sum += ps[i];
                    float m = 0;
                    for (float[] c : nv) m = Math.max(m, dot(v, c));
                    ns[i] = m;
                    float o = 0;
                    for (float[] c : ov) o = Math.max(o, dot(v, c));
                    os[i] = o;
                }
                float mean = n > 0 ? sum / n : 0;
                JSObject s = new JSObject();
                for (int i = 0; i < n; i++) {
                    JSArray a = new JSArray();
                    a.put(Math.round((ps[i] - mean) * 1000) / 1000.0);
                    a.put(Math.round(ns[i] * 1000) / 1000.0);
                    a.put(Math.round(os[i] * 1000) / 1000.0);
                    a.put(bi[i]);
                    a.put(Math.round(bc[i] * 1000) / 1000.0);
                    s.put(keys[i], a);
                }
                saveCache();
                ret.put("ready", true);
                ret.put("s", s);
                ret.put("ms", System.currentTimeMillis() - t0);
                call.resolve(ret);
            } catch (Throwable t) {
                ret.put("ready", false);
                call.resolve(ret);
            }
        });
    }

    // ---- saved lists ----

    private File listDir() {
        File d = new File(getContext().getFilesDir(), "lists");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    private static boolean okId(String id) {
        return id != null && id.matches("[A-Za-z0-9_-]{1,64}");
    }

    private static String read(File f) throws Exception {
        try (FileInputStream in = new FileInputStream(f)) {
            byte[] b = new byte[(int) f.length()];
            int off = 0;
            while (off < b.length) {
                int r = in.read(b, off, b.length - off);
                if (r < 0) break;
                off += r;
            }
            return new String(b, 0, off, StandardCharsets.UTF_8);
        }
    }

    private static void write(File f, String s) throws Exception {
        File tmp = new File(f.getPath() + ".tmp");
        try (FileOutputStream out = new FileOutputStream(tmp)) {
            out.write(s.getBytes(StandardCharsets.UTF_8));
            out.getFD().sync();
        }
        if (!tmp.renameTo(f)) throw new IllegalStateException("rename failed");
    }

    /** id: "current" for the open list, or a saved list's id; data: the list as JSON text. */
    @PluginMethod
    public void putList(PluginCall call) {
        String id = call.getString("id");
        String data = call.getString("data");
        if (!okId(id) || data == null || data.length() > 2_000_000) {
            call.reject("bad list");
            return;
        }
        try {
            write(new File(listDir(), id + ".json"), data);
            call.resolve();
        } catch (Exception e) {
            call.reject("save failed");
        }
    }

    @PluginMethod
    public void getList(PluginCall call) {
        String id = call.getString("id");
        JSObject ret = new JSObject();
        if (!okId(id)) {
            call.reject("bad list");
            return;
        }
        File f = new File(listDir(), id + ".json");
        try {
            ret.put("data", f.exists() ? read(f) : null);
        } catch (Exception e) {
            ret.put("data", null);
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void deleteList(PluginCall call) {
        String id = call.getString("id");
        if (!okId(id)) {
            call.reject("bad list");
            return;
        }
        new File(listDir(), id + ".json").delete();
        call.resolve();
    }

    /** The ids of the saved lists, with each file's last change time. */
    @PluginMethod
    public void lists(PluginCall call) {
        JSArray out = new JSArray();
        File[] fs = listDir().listFiles();
        if (fs != null) {
            for (File f : fs) {
                String n = f.getName();
                if (!n.endsWith(".json") || n.equals("current.json")) continue;
                JSObject o = new JSObject();
                o.put("id", n.substring(0, n.length() - 5));
                o.put("at", f.lastModified());
                out.put(o);
            }
        }
        JSObject ret = new JSObject();
        ret.put("lists", out);
        call.resolve(ret);
    }
}
