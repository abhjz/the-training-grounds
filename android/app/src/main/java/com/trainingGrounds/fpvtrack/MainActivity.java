package com.trainingGrounds.fpvtrack;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Receives track files opened with / shared to the app
        registerPlugin(TrackFilePlugin.class);
        super.onCreate(savedInstanceState);
        // The designer UI is laid out at fixed sizes; ignore the phone's
        // system font-size setting so labels don't overflow their panels.
        getBridge().getWebView().getSettings().setTextZoom(100);
    }
}
