package com.trainingGrounds.fpvtrack;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.OpenableColumns;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/**
 * Receives track files opened with ("Open with Training Grounds") or shared to the app,
 * and hands their text to the web app as a "trackFile" event.
 */
@CapacitorPlugin(name = "TrackFile")
public class TrackFilePlugin extends Plugin {
    private static final int MAX_BYTES = 10 * 1024 * 1024;

    @Override
    public void load() {
        // Cold start: the file came in with the intent that launched the app
        handleIntent(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        Uri uri = null;
        if (Intent.ACTION_VIEW.equals(action)) {
            uri = intent.getData();
        } else if (Intent.ACTION_SEND.equals(action)) {
            uri = Build.VERSION.SDK_INT >= 33
                ? intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri.class)
                : intent.getParcelableExtra(Intent.EXTRA_STREAM);
        }
        if (uri == null) return;

        JSObject data = new JSObject();
        data.put("name", displayName(uri));
        try {
            data.put("text", readText(uri));
        } catch (Exception e) {
            data.put("error", "Could not read the file: " + e.getMessage());
        }
        // Retained until the web app registers its listener, so cold starts work too
        notifyListeners("trackFile", data, true);

        // Don't re-import the same file on rotation / relaunch
        getActivity().setIntent(new Intent(Intent.ACTION_MAIN));
    }

    private String readText(Uri uri) throws Exception {
        try (InputStream in = getContext().getContentResolver().openInputStream(uri)) {
            if (in == null) throw new Exception("empty file");
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) != -1) {
                out.write(buf, 0, n);
                if (out.size() > MAX_BYTES) throw new Exception("file is too large");
            }
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    private String displayName(Uri uri) {
        try (Cursor c = getContext().getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                String name = c.getString(0);
                if (name != null) return name;
            }
        } catch (Exception ignored) {
        }
        String last = uri.getLastPathSegment();
        return last != null ? last : "track.json";
    }
}
