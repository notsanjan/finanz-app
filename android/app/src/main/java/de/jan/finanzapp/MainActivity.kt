package de.jan.finanzapp

import android.os.Bundle
import androidx.activity.OnBackPressedCallback
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(FinanzSpeicherPlugin::class.java)
        super.onCreate(savedInstanceState)
        // Zurück-Taste: erst offene Fenster in der App schließen, dann die App verlassen
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                val webView = bridge?.webView
                if (webView == null) { finish(); return }
                webView.evaluateJavascript("(window.__zurueck && window.__zurueck()) ? 'ja' : 'nein'") { antwort ->
                    if (antwort != "\"ja\"") moveTaskToBack(true)
                }
            }
        })
    }
}
